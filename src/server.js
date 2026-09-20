const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const config = require("./config");
const campaignsRouter = require("./routes/campaigns");
const webhooksRouter = require("./routes/webhooks");
const icpsRouter = require("./routes/icps");
const controlRouter = require("./routes/control");
const { seedIfEmpty } = require("./bootstrap/seedDemoData");

const app = express();

// Defense-in-depth: never let one bad outbound call (SMS/voice/email/webhook)
// take down the whole demo. Log and keep serving.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] keeping process alive:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection] keeping process alive:", err);
});

app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false })); // Twilio posts form-encoded

// The control-plane dashboard is the actual product surface for judges —
// serve it at "/" instead of a bare JSON health check.
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => {
  res.json({
    service: "sdr-voice-sms-agent",
    twilio_live: config.twilio.isLive,
    dronahq_voice_live: config.dronahq.voiceIsLive,
    dronahq_conversation_live: config.dronahq.conversationIsLive,
    apollo_live: config.apollo.isLive,
  });
});

app.use("/api/campaigns", campaignsRouter);
app.use("/api/icps", icpsRouter);
app.use("/api/control", controlRouter);
app.use("/webhooks", webhooksRouter);

seedIfEmpty()
  .catch((err) => console.error("[seed] auto-seed on boot failed (server will still start):", err))
  .finally(() => {
    app.listen(config.port, () => {
      console.log(`sdr-voice-sms-agent listening on http://localhost:${config.port}`);
      console.log(`Twilio live: ${config.twilio.isLive}`);
      console.log(`DronaHQ voice live: ${config.dronahq.voiceIsLive}`);
      console.log(`DronaHQ conversation live: ${config.dronahq.conversationIsLive}`);
      if (!config.twilio.isLive || !config.dronahq.voiceIsLive || !config.dronahq.conversationIsLive) {
        console.log("Running in MOCK MODE for any unconfigured integration above - safe to test end-to-end.");
      }
    });
  });
