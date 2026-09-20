const express = require("express");
const store = require("../state/store");
const pipeline = require("../agents/pipeline");
const { getIcpProspects } = require("../data/icpProspects");
const crypto = require("crypto");
const { buildCampaign, AGENT_KEYS } = require("../campaigns/factory");

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

const router = express.Router();

const FUNNEL_STAGES = ["discovered", "researched", "qualified", "disqualified", "contacted", "engaged", "meeting", "opportunity"];

function activeText(versions) {
  const active = (versions || []).find((v) => v.active);
  return active ? active.text : (versions && versions[versions.length - 1] ? versions[versions.length - 1].text : "");
}

function metricsFor(campaignId) {
  const enrollments = store.listEnrollments({ campaign_id: campaignId });
  const funnel = FUNNEL_STAGES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
  for (const e of enrollments) funnel[e.funnel_stage] = (funnel[e.funnel_stage] || 0) + 1;
  const outreach = enrollments.filter((e) => ["contacted", "engaged", "meeting", "opportunity"].includes(e.funnel_stage)).length;
  const meetings = enrollments.filter((e) => ["meeting", "opportunity"].includes(e.funnel_stage)).length;
  return { prospects: enrollments.length, outreach, meetings, funnel };
}

function serializeCampaign(c) {
  return {
    ...c,
    prompts: {
      system_active: activeText(c.prompts.system),
      agents_active: AGENT_KEYS.reduce((acc, k) => ({ ...acc, [k]: activeText(c.prompts.agents[k]) }), {}),
    },
    metrics: metricsFor(c.id),
  };
}

// ---------------------------------------------------------------------------
// Campaign CRUD
// ---------------------------------------------------------------------------

router.get("/", (req, res) => {
  res.json(store.listCampaigns().map(serializeCampaign));
});

router.post("/", (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: "name is required" });

  let prospectPool = body.prospect_pool || [];
  if (!prospectPool.length && body.icp_id) {
    const icp = getIcpProspects(body.icp_id);
    if (icp) prospectPool = icp.prospects.map((p) => ({ ...p, source: "apollo" }));
  }

  const campaign = buildCampaign({ ...body, prospect_pool: prospectPool });
  store.saveCampaign(campaign);
  res.status(201).json(serializeCampaign(campaign));
});

router.get("/:id", (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  res.json(serializeCampaign(campaign));
});

router.patch("/:id", (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  const body = req.body || {};

  if (body.name) campaign.name = body.name;
  if (body.description !== undefined) campaign.description = body.description;
  if (body.owner) campaign.owner = body.owner;
  if (body.daily_limit) campaign.daily_limit = body.daily_limit;
  if (body.targeting) campaign.targeting = { ...campaign.targeting, ...body.targeting };
  if (body.channels) campaign.channels = { ...campaign.channels, ...body.channels };
  if (body.agents) campaign.agents = { ...campaign.agents, ...body.agents };

  campaign.updated_at = new Date().toISOString();
  campaign.history.push({ ts: campaign.updated_at, actor: body.actor || campaign.owner, action: "updated", detail: body });
  store.saveCampaign(campaign);
  res.json(serializeCampaign(campaign));
});

// ---------------------------------------------------------------------------
// Lifecycle: Draft -> Live -> Paused -> Completed / Archived
// ---------------------------------------------------------------------------

function transition(req, res, nextStatus, allowedFrom) {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  if (allowedFrom && !allowedFrom.includes(campaign.status)) {
    return res.status(409).json({ error: `Cannot move campaign from "${campaign.status}" to "${nextStatus}"` });
  }
  campaign.status = nextStatus;
  campaign.updated_at = new Date().toISOString();
  campaign.history.push({ ts: campaign.updated_at, actor: (req.body && req.body.actor) || campaign.owner, action: nextStatus });
  store.saveCampaign(campaign);
  store.logEvent({ type: "campaign_lifecycle", campaign_id: campaign.id, status: nextStatus });
  res.json(serializeCampaign(campaign));
}

router.post("/:id/activate", (req, res) => transition(req, res, "live", ["draft", "paused"]));
router.post("/:id/pause", (req, res) => transition(req, res, "paused", ["live"]));
router.post("/:id/resume", (req, res) => transition(req, res, "live", ["paused"]));
router.post("/:id/complete", (req, res) => transition(req, res, "completed", ["live", "paused"]));
router.post("/:id/archive", (req, res) => transition(req, res, "archived", ["completed", "draft", "paused"]));

router.post("/:id/duplicate", (req, res) => {
  const source = store.getCampaign(req.params.id);
  if (!source) return res.status(404).json({ error: "Unknown campaign" });
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = newId("camp");
  copy.name = (req.body && req.body.name) || `${source.name} (variant)`;
  copy.status = "draft";
  const now = new Date().toISOString();
  copy.created_at = now;
  copy.updated_at = now;
  copy.history = [{ ts: now, actor: (req.body && req.body.actor) || source.owner, action: "duplicated_from", detail: { source_id: source.id } }];
  store.saveCampaign(copy);
  res.status(201).json(serializeCampaign(copy));
});

// ---------------------------------------------------------------------------
// Prompt / harness management (versioned, roll-back-able)
// ---------------------------------------------------------------------------

router.get("/:id/prompts", (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  res.json(campaign.prompts);
});

router.post("/:id/prompts", (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  const { scope, text, author } = req.body || {};
  if (!text) return res.status(400).json({ error: "text is required" });

  const list = scope === "system" ? campaign.prompts.system : campaign.prompts.agents[scope];
  if (!list) return res.status(400).json({ error: `Unknown prompt scope "${scope}"` });

  list.forEach((v) => (v.active = false));
  const version = list.length ? Math.max(...list.map((v) => v.version)) + 1 : 1;
  list.push({ version, text, active: true, created_at: new Date().toISOString(), author: author || campaign.owner });

  campaign.updated_at = new Date().toISOString();
  campaign.history.push({ ts: campaign.updated_at, actor: author || campaign.owner, action: "prompt_updated", detail: { scope, version } });
  store.saveCampaign(campaign);
  res.status(201).json(campaign.prompts);
});

router.post("/:id/prompts/:scope/:version/activate", (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  const { scope, version } = req.params;
  const list = scope === "system" ? campaign.prompts.system : campaign.prompts.agents[scope];
  if (!list) return res.status(400).json({ error: `Unknown prompt scope "${scope}"` });
  const target = list.find((v) => v.version === Number(version));
  if (!target) return res.status(404).json({ error: `No version ${version} for scope "${scope}"` });

  list.forEach((v) => (v.active = v.version === Number(version)));
  campaign.updated_at = new Date().toISOString();
  campaign.history.push({ ts: campaign.updated_at, actor: (req.body && req.body.actor) || campaign.owner, action: "prompt_rollback", detail: { scope, version: Number(version) } });
  store.saveCampaign(campaign);
  res.json(campaign.prompts);
});

// ---------------------------------------------------------------------------
// Intelligence layer: enrollments + running the pipeline
// ---------------------------------------------------------------------------

router.get("/:id/enrollments", (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  const enrollments = store.listEnrollments({ campaign_id: campaign.id }).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  res.json(enrollments);
});

router.post("/:id/enrollments", async (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  const prospect = req.body && req.body.prospect;
  if (!prospect || !prospect.name) return res.status(400).json({ error: "prospect.name is required" });

  const enrollment = pipeline.enrollProspect(campaign, { source: "manual", ...prospect });
  let runResult = { skipped: true, reason: "campaign is not live yet — prospect enrolled but not run" };
  if (campaign.status === "live") {
    runResult = await pipeline.runEnrollment(enrollment, campaign, store.getSettings());
  }
  res.status(201).json({ enrollment: store.getEnrollment(enrollment.id), run: runResult });
});

router.post("/:id/enrollments/:eid/advance", (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  const enrollment = store.getEnrollment(req.params.eid);
  if (!enrollment || enrollment.campaign_id !== campaign.id) return res.status(404).json({ error: "Unknown enrollment" });
  const { stage } = req.body || {};
  if (!FUNNEL_STAGES.includes(stage)) return res.status(400).json({ error: `stage must be one of ${FUNNEL_STAGES.join(", ")}` });

  enrollment.funnel_stage = stage;
  enrollment.agent_log.push({ ts: new Date().toISOString(), agent: "operator", action: "manual_override", detail: { stage } });
  enrollment.updated_at = new Date().toISOString();
  store.saveEnrollment(enrollment);
  store.logEvent({ type: "agent_activity", campaign_id: campaign.id, agent: "operator", action: "manual_override", detail: { enrollment_id: enrollment.id, stage } });
  res.json(enrollment);
});

router.post("/:id/run", async (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  try {
    const result = await pipeline.runCampaign(campaign, campaign.prospect_pool || []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/follow-ups/run", async (req, res) => {
  const campaign = store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Unknown campaign" });
  try {
    const result = await pipeline.runFollowUps(campaign);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/activity", (req, res) => {
  const events = store
    .allEvents()
    .filter((e) => e.type === "agent_activity" && e.campaign_id === req.params.id)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, Number(req.query.limit) || 100);
  res.json(events);
});

module.exports = router;
