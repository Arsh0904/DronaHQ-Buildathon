const config = require("../config");

let twilioClient = null;
if (config.twilio.isLive) {
  // eslint-disable-next-line global-require
  const twilio = require("twilio");
  twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
}

/**
 * Sends an SMS. In mock mode (no real Twilio credentials in .env) this just
 * logs what WOULD be sent, so the whole agent pipeline can be exercised on
 * dummy data before any real credentials exist.
 */
async function sendSms(to, body) {
  if (!config.twilio.isLive) {
    console.log(`[MOCK][Twilio SMS] to=${to} body="${body}"`);
    return { mock: true, to, body, sid: `MOCK-${Date.now()}` };
  }
  const message = await twilioClient.messages.create({
    to,
    from: config.twilio.smsFrom,
    body,
  });
  return { mock: false, sid: message.sid, status: message.status };
}

module.exports = { sendSms };
