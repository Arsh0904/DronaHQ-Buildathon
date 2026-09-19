const express = require("express");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const config = require("./config");
const campaignsRouter = require("./routes/campaigns");
const webhooksRouter = require("./routes/webhooks");

const app = express();
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false })); // Twilio posts form-encoded

app.get("/", (req, res) => {
  res.json({
    service: "sdr-voice-sms-agent",
    twilio_live: config.twilio.isLive,
    dronahq_voice_live: config.dronahq.voiceIsLive,
    dronahq_conversation_live: config.dronahq.conversationIsLive,
  });
});

app.use("/api/campaigns", campaignsRouter);
app.use("/webhooks", webhooksRouter);

app.listen(config.port, () => {
  console.log(`sdr-voice-sms-agent listening on http://localhost:${config.port}`);
  console.log(`Twilio live: ${config.twilio.isLive}`);
  console.log(`DronaHQ voice live: ${config.dronahq.voiceIsLive}`);
  console.log(`DronaHQ conversation live: ${config.dronahq.conversationIsLive}`);
  if (!config.twilio.isLive || !config.dronahq.voiceIsLive || !config.dronahq.conversationIsLive) {
    console.log("Running in MOCK MODE for any unconfigured integration above - safe to test end-to-end.");
  }
});
