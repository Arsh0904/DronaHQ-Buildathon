/**
 * The Intelligence Layer (problem statement Section 4): seven named agents
 * that turn one enrolled prospect into a real, logged, multi-channel
 * outreach attempt — gated at every step by the Control Plane's campaign
 * status, per-agent pause, per-channel pause and the global kill switch.
 *
 * Every agent here is a small, deterministic, dependency-free function so
 * the demo works with zero paid credentials; the two steps that benefit
 * from an LLM (Personalisation and Conversation) call out to the DronaHQ
 * conversation webhook when it is live and returns real content, and fall
 * back to a knowledge-grounded template otherwise (extractStructuredDecision
 * in ../dronahq/client.js already refuses to fabricate a fake "live" answer
 * — this is the safety net so a lead still gets a real, personalised
 * message even when that webhook returns nothing).
 */
const store = require("../state/store");
const kb = require("../knowledge/kb");
const { sendSms } = require("../twilio/client");
const { sendEmail } = require("../email/client");
const { dispatchVoiceCalls } = require("../dronahq/client");
const { prepareLinkedInMessage } = require("../linkedin/client");
const { invokeConversationAgent } = require("../dronahq/client");

function firstName(name) {
  return (name || "there").split(" ")[0];
}

function agentEnabled(campaign, agentKey) {
  return Boolean(campaign.agents && campaign.agents[agentKey] !== false);
}

function channelUsable(campaign, settings, channel, prospect) {
  const enabled = campaign.channels && campaign.channels[channel];
  const paused = settings.channel_pause && settings.channel_pause[channel];
  const hasIdentifier =
    (channel === "sms" && prospect.phone) ||
    (channel === "voice" && prospect.phone) ||
    (channel === "email" && prospect.email) ||
    (channel === "linkedin" && prospect.linkedin_url);
  return Boolean(enabled) && !paused && Boolean(hasIdentifier);
}

function logActivity(campaign, agent, action, detail) {
  store.logEvent({
    type: "agent_activity",
    campaign_id: campaign.id,
    agent,
    action,
    detail,
  });
}

// ---------------------------------------------------------------------------
// 1. ICP Fitment Agent
// ---------------------------------------------------------------------------
function icpFitmentAgent(prospect, campaign) {
  const targeting = campaign.targeting || {};
  const roles = targeting.target_roles || [];
  const exclusions = (targeting.exclusion_criteria || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const title = (prospect.title || "").toLowerCase();
  const reasons = [];
  let score = 55; // sourced from an already ICP-matched list, so start above the line

  if (roles.length) {
    const matches = roles.some((r) => title.includes(r.toLowerCase()));
    if (matches) {
      score += 30;
      reasons.push("title matches a target role");
    } else {
      score -= 25;
      reasons.push("title does not clearly match any target role");
    }
  } else {
    reasons.push("no explicit role filter configured for this campaign");
  }

  for (const ex of exclusions) {
    if (ex && title.includes(ex)) {
      score -= 100;
      reasons.push(`excluded: title contains "${ex}"`);
    }
  }

  if (targeting.geography && prospect.geography) {
    if (!String(prospect.geography).toLowerCase().includes(String(targeting.geography).toLowerCase())) {
      score -= 15;
      reasons.push("geography does not match target");
    }
  }

  const qualified = score >= 60;
  return { qualified, score, reason: reasons.join("; ") || (qualified ? "meets campaign criteria" : "below qualification threshold") };
}

// ---------------------------------------------------------------------------
// 2. Lead Research & Enrichment Agent
// ---------------------------------------------------------------------------
function leadResearchAgent(prospect) {
  const bits = [`${prospect.name} is ${prospect.title || "a contact"} at ${prospect.company || "their company"}.`];
  if (prospect.segment) bits.push(`Segment: ${prospect.segment}.`);
  if (prospect.linkedin_url) bits.push("Public LinkedIn profile available for further research.");
  bits.push(
    prospect.source === "apollo"
      ? "Sourced and verified via Apollo.io."
      : "Synthetic demo contact, used to exercise SMS/voice/email channels end to end."
  );
  return { summary: bits.join(" ") };
}

// ---------------------------------------------------------------------------
// 3. Outreach Strategy Agent
// ---------------------------------------------------------------------------
function outreachStrategyAgent(prospect, campaign, settings) {
  const order = ["sms", "voice", "email", "linkedin"].filter((ch) => channelUsable(campaign, settings, ch, prospect));
  return {
    channels: order,
    reason: order.length
      ? `selected ${order.join(", ")} based on available identifiers, campaign channel config, and current pause state`
      : "no usable channel: prospect is missing every identifier the enabled, unpaused channels require",
  };
}

// ---------------------------------------------------------------------------
// 4. Personalisation Agent (with knowledge-grounded template fallback)
// ---------------------------------------------------------------------------
async function personalizationAgent(prospect, campaign) {
  const query = [prospect.title, prospect.company, campaign.targeting && campaign.targeting.icp_id, campaign.description]
    .filter(Boolean)
    .join(" ");
  const knowledge = kb.retrieve(query, 2);

  let decision;
  try {
    decision = await invokeConversationAgent({
      mode: "opening",
      lead: prospect,
      campaign: { id: campaign.id, objective: campaign.description || "book a 15-minute call" },
      incoming_message: "",
      conversation_history: [],
    });
  } catch (err) {
    decision = { action: undefined, reason: err.message };
  }

  const hasRealContent = decision && decision.action && decision.message && decision.reason !== "dronahq_run_had_no_response_text";
  if (hasRealContent) {
    return { message: decision.message, source: "dronahq_conversation_agent", knowledge_used: knowledge.map((k) => k.heading) };
  }

  // Fallback: build a real, knowledge-grounded message locally so the
  // pipeline never stalls on the DronaHQ webhook's async/empty-response gap.
  const name = firstName(prospect.name);
  const company = prospect.company ? ` at ${prospect.company}` : "";
  const angle = knowledge[0]
    ? knowledge[0].text.replace(/^#{1,3}\s.*$/m, "").split(".")[0].trim() + "."
    : campaign.description || "we help teams run outbound as one coordinated system";
  const message = `Hi ${name} — ${angle} Worth a 15-minute look for your team${company}?`;
  return { message, source: "template_fallback", knowledge_used: knowledge.map((k) => k.heading) };
}

// ---------------------------------------------------------------------------
// 7. Follow-up Agent
// ---------------------------------------------------------------------------
function followUpAgent(enrollment) {
  if (enrollment.funnel_stage !== "contacted") return { shouldFollowUp: false };
  const count = enrollment.follow_up_count || 0;
  if (count >= 2) return { shouldFollowUp: false, disqualify: true, reason: "two follow-ups sent with no reply" };
  const name = firstName(enrollment.prospect.name);
  return {
    shouldFollowUp: true,
    message: `Hi ${name}, following up in case this got buried — happy to send more info if useful. Any interest in a quick chat?`,
  };
}

// ---------------------------------------------------------------------------
// Orchestration: enroll a prospect, then run the full pipeline for it
// ---------------------------------------------------------------------------
function makeEnrollmentId(campaignId, prospect) {
  const idPart = prospect.linkedin_url || prospect.email || prospect.phone || prospect.name;
  return `${campaignId}::${String(idPart).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function enrollProspect(campaign, prospect) {
  const id = makeEnrollmentId(campaign.id, prospect);
  const existing = store.getEnrollment(id);
  if (existing) return existing;

  const conflicts = store.findConflictingEnrollments(prospect, campaign.id);
  const enrollment = {
    id,
    campaign_id: campaign.id,
    prospect,
    funnel_stage: "discovered",
    follow_up_count: 0,
    channels_used: [],
    agent_log: [],
    conflicts: conflicts.map((c) => ({ campaign_id: c.campaign_id, enrollment_id: c.id })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.saveEnrollment(enrollment);
  logActivity(campaign, "control_plane", "prospect_discovered", { enrollment_id: id, name: prospect.name });
  if (conflicts.length) {
    logActivity(campaign, "control_plane", "conflict_detected", {
      enrollment_id: id,
      name: prospect.name,
      other_campaigns: conflicts.map((c) => c.campaign_id),
    });
  }
  return enrollment;
}

function appendLog(enrollment, entry) {
  enrollment.agent_log.push({ ts: new Date().toISOString(), ...entry });
  enrollment.updated_at = new Date().toISOString();
}

/** Runs the full pipeline (fitment -> research -> strategy -> personalise ->
 * send) for one enrollment, respecting the campaign's status, per-agent
 * pause flags, per-channel pause flags, and the global kill switch. */
async function runEnrollment(enrollment, campaign, settings) {
  if (settings.kill_switch) {
    return { skipped: true, reason: "global kill switch is engaged" };
  }
  if (campaign.status !== "live") {
    return { skipped: true, reason: `campaign is ${campaign.status}, not live` };
  }

  const prospect = enrollment.prospect;

  if (enrollment.funnel_stage === "discovered") {
    if (agentEnabled(campaign, "icp_fitment")) {
      const fitment = icpFitmentAgent(prospect, campaign);
      appendLog(enrollment, { agent: "icp_fitment", action: fitment.qualified ? "qualified" : "disqualified", detail: fitment });
      logActivity(campaign, "icp_fitment", fitment.qualified ? "qualified" : "disqualified", { enrollment_id: enrollment.id, name: prospect.name, score: fitment.score, reason: fitment.reason });
      enrollment.funnel_stage = fitment.qualified ? "qualified" : "disqualified";
      enrollment.fitment = fitment;
    } else {
      enrollment.funnel_stage = "qualified";
      appendLog(enrollment, { agent: "icp_fitment", action: "skipped_agent_disabled" });
    }
    store.saveEnrollment(enrollment);
    if (enrollment.funnel_stage === "disqualified") return { stage: enrollment.funnel_stage };
  }

  if (enrollment.funnel_stage === "qualified") {
    if (agentEnabled(campaign, "lead_research")) {
      const research = leadResearchAgent(prospect);
      enrollment.research = research.summary;
      appendLog(enrollment, { agent: "lead_research", action: "researched", detail: research });
      logActivity(campaign, "lead_research", "researched", { enrollment_id: enrollment.id, name: prospect.name });
      enrollment.funnel_stage = "researched";
      store.saveEnrollment(enrollment);
    } else {
      enrollment.funnel_stage = "researched";
    }
  }

  if (enrollment.funnel_stage === "researched") {
    const strategy = agentEnabled(campaign, "outreach_strategy")
      ? outreachStrategyAgent(prospect, campaign, settings)
      : { channels: ["sms", "voice", "email", "linkedin"].filter((ch) => channelUsable(campaign, settings, ch, prospect)), reason: "outreach_strategy agent disabled; using all usable channels" };

    appendLog(enrollment, { agent: "outreach_strategy", action: "planned", detail: strategy });
    logActivity(campaign, "outreach_strategy", "planned", { enrollment_id: enrollment.id, name: prospect.name, channels: strategy.channels });
    enrollment.planned_channels = strategy.channels;

    if (!strategy.channels.length) {
      appendLog(enrollment, { agent: "outreach_strategy", action: "held_no_usable_channel" });
      store.saveEnrollment(enrollment);
      return { stage: enrollment.funnel_stage, held: true, reason: strategy.reason };
    }

    const personalization = agentEnabled(campaign, "personalization")
      ? await personalizationAgent(prospect, campaign)
      : { message: `Hi ${firstName(prospect.name)}, quick note about ${campaign.description || "our platform"} — worth a look?`, source: "template_fallback_agent_disabled", knowledge_used: [] };

    appendLog(enrollment, { agent: "personalization", action: "drafted", detail: personalization });
    logActivity(campaign, "personalization", "drafted", { enrollment_id: enrollment.id, name: prospect.name, source: personalization.source });
    enrollment.last_message = personalization.message;
    enrollment.message_source = personalization.source;

    const channelResults = {};
    for (const channel of strategy.channels) {
      try {
        if (channel === "sms") channelResults.sms = await sendSms(prospect.phone, personalization.message);
        if (channel === "email") channelResults.email = await sendEmail(prospect.email, `Quick question${prospect.name ? ", " + firstName(prospect.name) : ""}`, personalization.message);
        if (channel === "linkedin") channelResults.linkedin = prepareLinkedInMessage(prospect, personalization.message);
        if (channel === "voice") channelResults.voice = await dispatchVoiceCalls([prospect.phone], { campaign_id: campaign.id, lead: prospect.name });
      } catch (err) {
        channelResults[channel] = { error: err.message };
      }
      appendLog(enrollment, { agent: `channel:${channel}`, action: channelResults[channel] && channelResults[channel].error ? "failed" : "sent", detail: channelResults[channel] });
      logActivity(campaign, `channel:${channel}`, channelResults[channel] && channelResults[channel].error ? "failed" : "sent", { enrollment_id: enrollment.id, name: prospect.name });
    }

    enrollment.channels_used = Object.keys(channelResults).filter((c) => !(channelResults[c] && channelResults[c].error));
    enrollment.channel_results = channelResults;
    enrollment.funnel_stage = "contacted";
    enrollment.last_contacted_at = new Date().toISOString();
    store.saveEnrollment(enrollment);
    return { stage: enrollment.funnel_stage, channels: enrollment.channels_used };
  }

  return { stage: enrollment.funnel_stage, noop: true };
}

/** Runs the pipeline over every not-yet-contacted enrollment in a campaign
 * (enrolling any not-yet-seen ICP prospects first). This is what the
 * control plane's "Run Campaign" button calls. */
async function runCampaign(campaign, prospectPool = []) {
  const settings = store.getSettings();
  if (settings.kill_switch) return { ran: 0, reason: "global kill switch is engaged" };
  if (campaign.status !== "live") return { ran: 0, reason: `campaign is ${campaign.status}, not live` };

  for (const prospect of prospectPool) {
    enrollProspect(campaign, prospect);
  }

  const enrollments = store.listEnrollments({ campaign_id: campaign.id }).filter((e) => e.funnel_stage !== "contacted" && e.funnel_stage !== "disqualified" && e.funnel_stage !== "engaged" && e.funnel_stage !== "meeting" && e.funnel_stage !== "opportunity");

  const results = [];
  for (const enrollment of enrollments) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runEnrollment(enrollment, campaign, settings);
    results.push({ enrollment_id: enrollment.id, name: enrollment.prospect.name, ...result });
  }
  return { ran: results.length, results };
}

/** Runs the Follow-up Agent over every "contacted" enrollment in a campaign. */
async function runFollowUps(campaign) {
  const settings = store.getSettings();
  if (settings.kill_switch) return { ran: 0, reason: "global kill switch is engaged" };
  if (campaign.status !== "live") return { ran: 0, reason: `campaign is ${campaign.status}, not live` };
  if (!agentEnabled(campaign, "follow_up")) return { ran: 0, reason: "follow_up agent disabled for this campaign" };

  const enrollments = store.listEnrollments({ campaign_id: campaign.id }).filter((e) => e.funnel_stage === "contacted");
  const results = [];
  for (const enrollment of enrollments) {
    const decision = followUpAgent(enrollment);
    if (decision.disqualify) {
      enrollment.funnel_stage = "disqualified";
      appendLog(enrollment, { agent: "follow_up", action: "disqualified_unresponsive", detail: decision });
      logActivity(campaign, "follow_up", "disqualified_unresponsive", { enrollment_id: enrollment.id, name: enrollment.prospect.name });
      store.saveEnrollment(enrollment);
      results.push({ enrollment_id: enrollment.id, action: "disqualified" });
      continue;
    }
    if (!decision.shouldFollowUp) continue;

    const strategy = enrollment.planned_channels && enrollment.planned_channels.length ? enrollment.planned_channels : outreachStrategyAgent(enrollment.prospect, campaign, settings).channels;
    const sendResults = {};
    for (const channel of strategy) {
      try {
        if (channel === "sms") sendResults.sms = await sendSms(enrollment.prospect.phone, decision.message);
        if (channel === "email") sendResults.email = await sendEmail(enrollment.prospect.email, "Following up", decision.message);
        if (channel === "linkedin") sendResults.linkedin = prepareLinkedInMessage(enrollment.prospect, decision.message);
      } catch (err) {
        sendResults[channel] = { error: err.message };
      }
    }
    enrollment.follow_up_count = (enrollment.follow_up_count || 0) + 1;
    enrollment.last_message = decision.message;
    enrollment.last_contacted_at = new Date().toISOString();
    appendLog(enrollment, { agent: "follow_up", action: "sent", detail: { message: decision.message, sendResults } });
    logActivity(campaign, "follow_up", "sent", { enrollment_id: enrollment.id, name: enrollment.prospect.name, count: enrollment.follow_up_count });
    store.saveEnrollment(enrollment);
    results.push({ enrollment_id: enrollment.id, action: "followed_up", count: enrollment.follow_up_count });
  }
  return { ran: results.length, results };
}

module.exports = {
  icpFitmentAgent,
  leadResearchAgent,
  outreachStrategyAgent,
  personalizationAgent,
  followUpAgent,
  enrollProspect,
  runEnrollment,
  runCampaign,
  runFollowUps,
  makeEnrollmentId,
};
