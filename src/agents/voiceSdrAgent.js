const { dispatchVoiceCalls } = require("../dronahq/client");
const store = require("../state/store");

/**
 * Voice SDR Agent: dispatches one outbound call per lead through DronaHQ's
 * Voice Agent (which itself does the qualifying / objection-handling /
 * escalation conversation, per its own instructions configured in Studio).
 * This function is the orchestration layer: which leads, in what batch,
 * with what per-lead context, and tracking the result.
 */
async function runVoiceCampaign(campaignId, leads) {
  const phoneNumbers = leads.map((l) => l.phone);
  const result = await dispatchVoiceCalls(phoneNumbers, { campaign_id: campaignId });

  for (const lead of leads) {
    store.upsertLead(lead.phone, {
      ...lead,
      campaign_id: campaignId,
      voice_batch_id: result.batch_id,
      voice_status: "dispatched",
    });
  }

  store.logEvent({
    type: "voice_campaign_dispatched",
    campaign_id: campaignId,
    batch_id: result.batch_id,
    count: leads.length,
    mock: result.mock,
  });

  return result;
}

/** Called by the DronaHQ pre-call webhook to hand the agent caller context. */
function getCallContext(phone) {
  const lead = store.getLead(phone);
  if (!lead) return null;
  return {
    name: lead.name,
    company: lead.company,
    role: lead.role,
    interest_area: lead.interest_area,
    campaign_id: lead.campaign_id,
  };
}

/** Called by the DronaHQ post-call webhook once a call ends. */
function recordCallOutcome(phone, outcome) {
  store.upsertLead(phone, {
    voice_status: "completed",
    voice_outcome: outcome.outcome || outcome.summary || null,
    voice_transcript: outcome.transcript || null,
  });
  store.logEvent({ type: "voice_call_completed", phone, outcome });
}

module.exports = { runVoiceCampaign, getCallContext, recordCallOutcome };
