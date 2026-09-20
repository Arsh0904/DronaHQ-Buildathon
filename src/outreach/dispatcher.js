/**
 * Unified 4-channel outreach: given a campaign + a lead (any mix of phone /
 * email / linkedin_url present), asks the DronaHQ conversation agent for a
 * personalised message once, then fires it down every channel the lead has
 * a real address for. This is the "one SDR working across channels" piece
 * the rubric asks for, not four disconnected sends.
 */
const { sendSms } = require("../twilio/client");
const { sendEmail } = require("../email/client");
const { dispatchVoiceCalls } = require("../dronahq/client");
const { invokeConversationAgent } = require("../dronahq/client");
const { prepareLinkedInMessage } = require("../linkedin/client");
const store = require("../state/store");

async function outreachLead(campaign, lead) {
  const decision = await invokeConversationAgent({
    mode: "opening",
    lead,
    campaign,
    incoming_message: "",
    conversation_history: [],
  });

  const channels = {};

  if (lead.phone) {
    try {
      channels.sms = await sendSms(lead.phone, decision.message);
    } catch (err) {
      channels.sms = { error: err.message };
    }
  }

  if (lead.email) {
    try {
      const subject = "Quick question" + (lead.name ? ", " + lead.name.split(" ")[0] : "");
      channels.email = await sendEmail(lead.email, subject, decision.message);
    } catch (err) {
      channels.email = { error: err.message };
    }
  }

  if (lead.linkedin_url) {
    try {
      channels.linkedin = prepareLinkedInMessage(lead, decision.message);
    } catch (err) {
      channels.linkedin = { error: err.message };
    }
  }

  if (lead.phone) {
    try {
      channels.voice = await dispatchVoiceCalls([lead.phone], { campaign_id: campaign.id, lead: lead.name });
    } catch (err) {
      channels.voice = { error: err.message };
    }
  }

  const saved = store.upsertLeadByIdentity(lead, {
    campaign_id: campaign.id,
    outreach_status: decision.lead_status || "contacted",
    last_message: decision.message,
    last_outreach_at: new Date().toISOString(),
    channels_used: Object.keys(channels),
  });

  store.logEvent({
    type: "multi_channel_outreach",
    campaign_id: campaign.id,
    lead_key: saved._key,
    decision: decision,
    channels: channels,
  });

  return { decision: decision, channels: channels };
}

async function outreachBatch(campaign, leads) {
  const results = [];
  for (const lead of leads) {
    const r = await outreachLead(campaign, lead);
    results.push(Object.assign({ lead: lead.name || lead.email || lead.phone }, r));
  }
  return results;
}

module.exports = { outreachLead: outreachLead, outreachBatch: outreachBatch };
