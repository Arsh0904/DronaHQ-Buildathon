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
  try {
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
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`DronaHQ voice dispatch failed: ${detail}`);
  }
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
  try {
    const { data } = await axios.post(
      config.dronahq.conversationWebhookUrl,
      payload,
      { headers: { "api-key": config.dronahq.conversationWebhookApiKey, "Content-Type": "application/json" } }
    );
    return { mock: false, ...data, ...extractStructuredDecision(data) };
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`DronaHQ conversation webhook failed: ${detail}`);
  }
}

/**
 * DronaHQ's webhook-trigger "Standard" response wraps the agent's actual
 * answer in an execution envelope ({ success, thread_id, run_id, message:
 * "Agent run completed successfully...", response: "<free text, often with
 * a ```json fenced block inside>" }) rather than returning our requested
 * { message, action, reason, lead_status } schema directly at the top
 * level. If the real fields are already top-level (schema respected
 * exactly), this is a no-op; otherwise it digs the JSON out of `response`
 * (or `message`) so callers can rely on decision.message/action/etc.
 */
function extractStructuredDecision(data) {
  if (data && typeof data.action === "string" && typeof data.message === "string" && data.message !== "Agent run completed successfully. See 'response' for execution output.") {
    return {};
  }
  const raw = (data && (data.response || data.message)) || "";
  if (typeof raw !== "string") return {};

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  try {
    const parsed = JSON.parse(candidate.trim());
    if (parsed && typeof parsed === "object") {
      return {
        message: parsed.message || raw,
        action: parsed.action,
        reason: parsed.reason,
        lead_status: parsed.lead_status,
      };
    }
  } catch (err) {
    // Not JSON (or not cleanly fenced) - fall through to raw text below.
  }
  // No parseable JSON found: treat the whole free-text response as the
  // message so at least something sensible gets sent, defaulting to a
  // safe non-destructive action.
  if (raw && raw !== "Agent run completed successfully. See \'response\' for execution output.") {
    return { message: raw, action: "send" };
  }
  return {};
}

module.exports = { dispatchVoiceCalls, getDispatchStatus, invokeConversationAgent };
