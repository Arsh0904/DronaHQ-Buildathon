/**
 * Email sending, provider-aware (same pattern as src/twilio/client.js).
 *
 * Providers (set EMAIL_PROVIDER in .env):
 *  - "gmail"  : real send via your own Gmail account's SMTP, using an App
 *               Password (needs 2-Step Verification on the Google
 *               account). Free, no new signup.
 *  - "resend" : real send via resend.com's free tier (100/day). No domain
 *               verification needed for a demo - send from
 *               "onboarding@resend.dev" to any address. Needs a free
 *               resend.com account + API key.
 *  - anything else (default): mock mode, logs and returns a fake result.
 */
const config = require("../config");

async function sendViaGmail(to, subject, text) {
  // eslint-disable-next-line global-require
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.email.gmail.user, pass: config.email.gmail.appPassword },
  });
  const info = await transporter.sendMail({ from: config.email.gmail.user, to, subject, text });
  return { mock: false, provider: "gmail", id: info.messageId, to, subject };
}

async function sendViaResend(to, subject, text) {
  // eslint-disable-next-line global-require
  const axios = require("axios");
  try {
    const resp = await axios.post(
      config.email.resend.apiUrl,
      { from: config.email.resend.from, to: [to], subject, text },
      { headers: { Authorization: `Bearer ${config.email.resend.apiKey}` } }
    );
    return { mock: false, provider: "resend", id: resp.data.id, to, subject };
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Resend send failed: ${detail}`);
  }
}

function sendMock(to, subject, text) {
  console.log(`[MOCK][Email] to=${to} subject="${subject}" body="${text}"`);
  return { mock: true, provider: "mock", id: `MOCK-${Date.now()}`, to, subject };
}

async function sendEmail(to, subject, text) {
  const provider = config.email.provider;

  if (provider === "gmail") {
    if (!config.email.gmail.isLive) {
      console.warn("[Email] EMAIL_PROVIDER=gmail but GMAIL_USER/GMAIL_APP_PASSWORD look like placeholders; falling back to mock.");
      return sendMock(to, subject, text);
    }
    return sendViaGmail(to, subject, text);
  }

  if (provider === "resend") {
    if (!config.email.resend.isLive) {
      console.warn("[Email] EMAIL_PROVIDER=resend but RESEND_API_KEY looks like a placeholder; falling back to mock.");
      return sendMock(to, subject, text);
    }
    return sendViaResend(to, subject, text);
  }

  return sendMock(to, subject, text);
}

module.exports = { sendEmail };
