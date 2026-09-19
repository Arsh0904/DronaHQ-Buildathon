const config = require("../config");

let twilioClient = null;
function getTwilioClient() {
  if (!twilioClient) {
    // eslint-disable-next-line global-require
    const twilio = require("twilio");
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

async function sendViaTwilio(to, body) {
  const client = getTwilioClient();
  const message = await client.messages.create({ to, from: config.twilio.smsFrom, body });
  return { mock: false, provider: "twilio", sid: message.sid, status: message.status, to, body };
}

/**
 * Free, no-signup SMS via textbelt.com. The literal key "textbelt" is
 * Textbelt's own public demo key: free forever, but capped at 1 SMS/day
 * SHARED GLOBALLY across everyone using that exact key. Good for one live
 * demo send; get a private key at textbelt.com for a guaranteed quota.
 */
async function sendViaTextbelt(to, body) {
  // eslint-disable-next-line global-require
  const axios = require("axios");
  const resp = await axios.post(config.textbelt.apiUrl, {
    phone: to,
    message: body,
    key: config.textbelt.apiKey,
  });
  const data = resp.data;
  if (!data.success) {
    throw new Error(`Textbelt send failed: ${data.error || "unknown error"}`);
  }
  return {
    mock: false,
    provider: "textbelt",
    sid: `TEXTBELT-${data.textId}`,
    quotaRemaining: data.quotaRemaining,
    to,
    body,
  };
}

function sendMock(to, body) {
  console.log(`[MOCK][SMS] to=${to} body="${body}"`);
  return { mock: true, provider: "mock", sid: `MOCK-${Date.now()}`, to, body };
}

/**
 * Sends an SMS. Provider is chosen by SMS_PROVIDER in .env:
 *  - "twilio"   : real Twilio send (requires a purchased/verified number)
 *  - "textbelt" : free, no-signup send via textbelt.com (see caveat above)
 *  - anything else (default): mock mode, logs and returns a fake result, so
 *    the whole agent pipeline can be exercised on dummy data with zero real
 *    credentials.
 */
async function sendSms(to, body) {
  const provider = config.sms.provider;

  if (provider === "twilio") {
    if (!config.twilio.isLive) {
      console.warn("[SMS] SMS_PROVIDER=twilio but Twilio credentials look like placeholders; falling back to mock.");
      return sendMock(to, body);
    }
    return sendViaTwilio(to, body);
  }

  if (provider === "textbelt") {
    return sendViaTextbelt(to, body);
  }

  return sendMock(to, body);
}

module.exports = { sendSms };
