const { sendSms } = require("../twilio/client");
const { invokeConversationAgent } = require("../dronahq/client");
const store = require("../state/store");

/** Sends the first SMS in a sequence: asks the DronaHQ conversation agent
 * for a personalised opener, then sends it via Twilio. */
async function startConversation(campaign, lead) {
  const decision = await invokeConversationAgent({
    mode: "opening",
    lead,
    campaign,
    incoming_message: "",
    conversation_history: [],
  });

  await sendSms(lead.phone, decision.message);

  store.upsertLead(lead.phone, {
    ...lead,
    campaign_id: campaign.id,
    sms_status: decision.lead_status || "contacted",
    conversation_history: [{ from: "agent", text: decision.message, ts: new Date().toISOString() }],
  });
  store.logEvent({ type: "sms_opening_sent", phone: lead.phone, campaign_id: campaign.id, message: decision.message });

  return decision;
}

/** Handles an inbound SMS reply from Twilio's webhook: asks the DronaHQ
 * conversation agent what to do next, executes it. */
async function handleIncomingReply(fromPhone, text) {
  const lead = store.getLead(fromPhone) || { phone: fromPhone, name: "Unknown", company: "", role: "", interest_area: "" };
  const history = lead.conversation_history || [];
  history.push({ from: "lead", text, ts: new Date().toISOString() });

  const decision = await invokeConversationAgent({
    mode: "reply",
    lead,
    campaign: { id: lead.campaign_id || "default", objective: "sales outreach" },
    incoming_message: text,
    conversation_history: history,
  });

  if (decision.action === "send" && decision.message) {
    await sendSms(fromPhone, decision.message);
    history.push({ from: "agent", text: decision.message, ts: new Date().toISOString() });
  }

  store.upsertLead(fromPhone, {
    conversation_history: history,
    sms_status: decision.lead_status || lead.sms_status,
    last_action: decision.action,
  });
  store.logEvent({ type: "sms_reply_handled", phone: fromPhone, incoming: text, decision });

  return decision;
}

module.exports = { startConversation, handleIncomingReply };
