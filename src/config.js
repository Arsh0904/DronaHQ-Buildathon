require("dotenv").config();

function bool(v) {
  return String(v || "").toLowerCase() === "true";
}

const config = {
  port: process.env.PORT || 3000,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    smsFrom: process.env.TWILIO_SMS_FROM_NUMBER || "",
  },

  sms: {
    // "twilio" | "textbelt" | "mock" (default). Lets SMS work for free via
    // Textbelt's no-signup demo key without ever needing a purchased number.
    provider: (process.env.SMS_PROVIDER || "mock").toLowerCase(),
  },

  textbelt: {
    apiKey: process.env.TEXTBELT_API_KEY || "textbelt",
    apiUrl: process.env.TEXTBELT_API_URL || "https://textbelt.com/text",
  },

  email: {
    // "gmail" | "resend" | "mock" (default). Free real-email send without
    // touching the leads' inboxes until you're ready.
    provider: (process.env.EMAIL_PROVIDER || "mock").toLowerCase(),
    gmail: {
      user: process.env.GMAIL_USER || "",
      appPassword: process.env.GMAIL_APP_PASSWORD || "",
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY || "",
      from: process.env.RESEND_FROM || "onboarding@resend.dev",
      apiUrl: process.env.RESEND_API_URL || "https://api.resend.com/emails",
    },
  },

  apollo: {
    apiKey: process.env.APOLLO_API_KEY || "",
  },

  dronahq: {
    apiKey: process.env.DRONAHQ_API_KEY || "",
    apiHost: (process.env.DRONAHQ_API_HOST || "").replace(/\/$/, ""),
    voiceAgentId: process.env.DRONAHQ_VOICE_AGENT_ID || "",
    conversationWebhookUrl: process.env.DRONAHQ_CONVERSATION_WEBHOOK_URL || "",
    conversationWebhookApiKey: process.env.DRONAHQ_CONVERSATION_WEBHOOK_API_KEY || "",
  },
};

// A credential is "real" only if it's set AND not still the placeholder
// from .env.example. This lets the whole pipeline run in MOCK MODE with
// zero real credentials, which is how you test end-to-end on dummy data
// before anything can actually text or call a real phone number.
function isConfigured(value) {
  return Boolean(value) && !/REPLACE_ME|REPLACEME/i.test(value);
}

config.apollo.isLive = isConfigured(config.apollo.apiKey);

config.twilio.isLive = isConfigured(config.twilio.accountSid) &&
  isConfigured(config.twilio.authToken) &&
  isConfigured(config.twilio.smsFrom);

config.dronahq.voiceIsLive = isConfigured(config.dronahq.apiKey) &&
  isConfigured(config.dronahq.apiHost) &&
  isConfigured(config.dronahq.voiceAgentId);

config.dronahq.conversationIsLive = isConfigured(config.dronahq.conversationWebhookUrl) &&
  isConfigured(config.dronahq.conversationWebhookApiKey);

config.email.gmail.isLive = isConfigured(config.email.gmail.user) && isConfigured(config.email.gmail.appPassword);
config.email.resend.isLive = isConfigured(config.email.resend.apiKey);

module.exports = config;
