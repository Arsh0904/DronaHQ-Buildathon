const express = require("express");
const { handleIncomingReply } = require("../agents/conversationAgent");
const { getCallContext, recordCallOutcome } = require("../agents/voiceSdrAgent");

const router = express.Router();

// --- Twilio: inbound SMS reply ---
// Configure in Twilio Console -> Phone Numbers -> your number -> Messaging
// -> "A message comes in" -> Webhook -> POST {PUBLIC_BASE_URL}/webhooks/twilio/sms
router.post("/twilio/sms", async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body || "";
  console.log(`[Twilio inbound SMS] from=${from} body="${body}"`);
  try {
    await handleIncomingReply(from, body);
  } catch (err) {
    console.error("Error handling incoming SMS:", err.message);
  }
  // Empty TwiML = no auto-reply from Twilio itself; our agent already sent one.
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

// --- Twilio: SMS/call status callbacks (optional, for logging) ---
router.post("/twilio/status", (req, res) => {
  console.log("[Twilio status callback]", req.body);
  res.sendStatus(200);
});

// --- DronaHQ Voice Agent: pre-call webhook (GET) ---
// Configure in Voice Agent -> Webhooks -> Pre-webhook.
// DronaHQ calls this right before the agent speaks, passing the destination
// number as a query param so we can hand back personalisation context.
router.get("/dronahq/precall", (req, res) => {
  const phone = req.query.phone || req.query.destination_phonenumber || req.query.to;
  const context = getCallContext(phone);
  if (!context) return res.json({ found: false });
  res.json({ found: true, ...context });
});

// --- DronaHQ Voice Agent: post-call webhook (POST) ---
// Configure in Voice Agent -> Webhooks -> Post-webhook.
router.post("/dronahq/postcall", (req, res) => {
  const phone = req.body.destination_phonenumber || req.body.phone || req.body.to;
  console.log(`[DronaHQ post-call] phone=${phone}`, req.body);
  if (phone) recordCallOutcome(phone, req.body);
  res.sendStatus(200);
});

module.exports = router;
