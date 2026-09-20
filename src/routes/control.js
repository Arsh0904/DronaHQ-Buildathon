/**
 * Global (platform-wide) control-plane endpoints: the kill switch, per
 * channel pause, and representative (human sales rep) management —
 * separate from campaign-level configuration (routes/campaigns.js).
 */
const express = require("express");
const crypto = require("crypto");
const store = require("../state/store");
const { RESERVED_DEMO_LEADS } = require("../data/reservedDemoLeads");

const router = express.Router();
const CHANNELS = ["sms", "voice", "email", "linkedin"];

// Suggested candidates for the dashboard's "Add Prospect" flow — synthetic,
// clearly-fake contacts not pre-enrolled anywhere, so a judge can add one
// live and watch the ICP Fitment Agent qualify or reject it in real time.
router.get("/demo-leads", (req, res) => {
  res.json(RESERVED_DEMO_LEADS);
});

router.get("/settings", (req, res) => {
  res.json(store.getSettings());
});

router.post("/kill-switch", (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  const settings = store.updateSettings({ kill_switch: enabled });
  store.logEvent({ type: "control_plane", action: enabled ? "global_kill_switch_engaged" : "global_kill_switch_released", actor: (req.body && req.body.actor) || "operator" });
  res.json(settings);
});

router.post("/channels/:channel/pause", (req, res) => {
  const { channel } = req.params;
  if (!CHANNELS.includes(channel)) return res.status(400).json({ error: `channel must be one of ${CHANNELS.join(", ")}` });
  const enabled = Boolean(req.body && req.body.enabled);
  const current = store.getSettings();
  const channel_pause = { ...current.channel_pause, [channel]: enabled };
  const settings = store.updateSettings({ channel_pause });
  store.logEvent({ type: "control_plane", action: enabled ? "channel_paused" : "channel_resumed", channel, actor: (req.body && req.body.actor) || "operator" });
  res.json(settings);
});

router.get("/reps", (req, res) => {
  res.json(store.listReps());
});

router.post("/reps", (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: "name is required" });
  const rep = {
    id: newId("rep"),
    name: body.name,
    email: body.email || "",
    assigned_campaigns: body.assigned_campaigns || [],
    daily_limit: body.daily_limit || 50,
    working_hours: body.working_hours || "9am-6pm",
    channels: body.channels || CHANNELS,
    created_at: new Date().toISOString(),
  };
  store.saveRep(rep);
  res.status(201).json(rep);
});

router.patch("/reps/:id", (req, res) => {
  const rep = store.getRep(req.params.id);
  if (!rep) return res.status(404).json({ error: "Unknown rep" });
  Object.assign(rep, req.body || {});
  store.saveRep(rep);
  res.json(rep);
});

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

module.exports = router;
