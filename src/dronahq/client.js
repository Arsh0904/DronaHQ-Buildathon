const axios = require("axios");
const config = require("../config");

/**
 * Outbound Call Dispatch: POST {host}/voice/outbound/dispatch
 * https://docs.dronahq.com/agents/voice-agent/api/dispatch/
 *
 * In mock mode (no DronaHQ voice credentials yet) this simulates a 202
 * Accepted response so the rest of the pipeline (campaign loop, state
 * tracking, README test steps) can be exercised end-to-end first.
 */
async function dispatchVoiceCalls(phoneNumbers, metadata = {}) {
  if (!config.dronahq.voiceIsLive) {
    console.log(`[MOCK][DronaHQ Voice] dispatch to=${JSON.stringify(phoneNumbers)} metadata=${JSON.stringify(metadata)}`);
    return { mock: true, batch_id: `MOCK-BATCH-${Date.now()}`, accepted: phoneNumbers.length };
  }
  const { data } = await axios.post(
    `${config.dronahq.apiHost}/voice/outbound/dispatch`,
    {
      agent_id: config.dronahq.voiceAgentId,
      destination_phonenumber: phoneNumbers,
      metadata,
    },
    { headers: { "api-key": config.dronahq.apiKey, "Content-Type": "application/json" } }
  );
  return { mock: false, ...data };
}

async function getDispatchStatus(batchId) {
  if (!config.dronahq.voiceIsLive || batchId.startsWith("MOCK-")) {
    return { mock: true, batch_id: batchId, calls: [] };
  }
  const { data } = await axios.get(
    `${config.dronahq.apiHost}/voice/outbound/dispatch/${batchId}`,
    { headers: { "api-key": config.dronahq.apiKey } }
  );
  return { mock: false, ...data };
}

/**
 * Calls a DronaHQ Agent's Webhook Trigger (the "brain" for the SMS
 * conversation agent — decides the next message + action given lead
 * context and, optionally, the prospect's latest reply).
 * https://docs.dronahq.com/agents/triggers/inbuilt-triggers/webhook/
 *
 * Expected agent response schema (configure this as the trigger's
 * "Standard" response JSON Schema in DronaHQ Studio):
 *   { "message": string, "action": "send"|"escalate"|"stop"|"book_meeting",
 *     "reason": string, "lead_status": string }
 */
async function invokeConversationAgent(payload) {
  if (!config.dronahq.conversationIsLive) {
    console.log(`[MOCK][DronaHQ Conversation Agent] payload=${JSON.stringify(payload)}`);
    const isReply = Boolean(payload.incoming_message);
    return {
      mock: true,
      message: isReply
        ? `Thanks for the reply, ${(payload.lead.name || "there").split(" ")[0]}! (mock follow-up message)`
        : `Hi ${(payload.lead.name || "there").split(" ")[0]}, this is a mock opening message about ${payload.campaign.objective}.`,
      action: "send",
      reason: "mock mode - no DronaHQ conversation webhook configured yet",
      lead_status: isReply ? "engaged" : "new",
    };
  }
  const { data } = await axios.post(
    config.dronahq.conversationWebhookUrl,
    payload,
    { headers: { "api-key": config.dronahq.conversationWebhookApiKey, "Content-Type": "application/json" } }
  );
  return { mock: false, ...data };
}

module.exports = { dispatchVoiceCalls, getDispatchStatus, invokeConversationAgent };
