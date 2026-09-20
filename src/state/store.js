// Minimal, dependency-free "database" for the buildathon: a JSON file on
// disk. Good enough to demonstrate the control plane (campaigns, reps,
// settings) and the intelligence layer's prospect/agent-activity state, and
// swap for a real DB later without touching the logic above it.
const fs = require("fs");
const path = require("path");
const { normalizePhone } = require("./phone");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "state.json");

function defaultState() {
  return {
    // Legacy, phone-keyed lead store used by the original single-thread SMS
    // conversation flow and the Twilio/DronaHQ webhooks (channel smoke
    // tests independent of the campaign pipeline below).
    leads: {},
    events: [],

    // Control plane
    campaigns: {},
    reps: {},
    settings: {
      kill_switch: false,
      channel_pause: { sms: false, voice: false, email: false, linkedin: false },
      updated_at: new Date().toISOString(),
    },

    // Intelligence layer: one row per (campaign, prospect) — a prospect can
    // be enrolled in more than one campaign, each with its own funnel state.
    enrollments: {},
  };
}

function load() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    state = {};
  }
  // Backfill any keys missing from an older state.json so this never
  // crashes on a partial/legacy file.
  const d = defaultState();
  return {
    leads: state.leads || d.leads,
    events: state.events || d.events,
    campaigns: state.campaigns || d.campaigns,
    reps: state.reps || d.reps,
    settings: { ...d.settings, ...(state.settings || {}) },
    enrollments: state.enrollments || d.enrollments,
  };
}

function save(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Legacy lead store (unchanged behaviour — webhooks.js / conversationAgent.js
// / voiceSdrAgent.js depend on this exact shape).
// ---------------------------------------------------------------------------

function getLead(phone) {
  const state = load();
  return state.leads[normalizePhone(phone)];
}

function upsertLead(phone, patch) {
  const key = normalizePhone(phone);
  const state = load();
  state.leads[key] = { ...(state.leads[key] || {}), ...patch, phone: key };
  save(state);
  return state.leads[key];
}

function logEvent(event) {
  const state = load();
  state.events.push({ ts: new Date().toISOString(), ...event });
  save(state);
}

function identityKey(lead) {
  if (lead.phone) return normalizePhone(lead.phone);
  if (lead.email) return `email:${String(lead.email).toLowerCase().trim()}`;
  if (lead.linkedin_url) return `li:${String(lead.linkedin_url).toLowerCase().trim()}`;
  if (lead.name) return `name:${String(lead.name).toLowerCase().trim()}`;
  throw new Error("Lead has no phone, email, linkedin_url, or name to key on");
}

function getLeadByIdentity(lead) {
  const state = load();
  return state.leads[identityKey(lead)];
}

function upsertLeadByIdentity(lead, patch) {
  const key = identityKey(lead);
  const state = load();
  state.leads[key] = { ...(state.leads[key] || {}), ...lead, ...patch, _key: key };
  save(state);
  return state.leads[key];
}

function allLeads() {
  return Object.values(load().leads);
}

function allEvents() {
  return load().events;
}

// ---------------------------------------------------------------------------
// Control plane: campaigns
// ---------------------------------------------------------------------------

function listCampaigns() {
  return Object.values(load().campaigns).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
}

function getCampaign(id) {
  return load().campaigns[id];
}

function saveCampaign(campaign) {
  const state = load();
  state.campaigns[campaign.id] = campaign;
  save(state);
  return campaign;
}

function deleteCampaign(id) {
  const state = load();
  delete state.campaigns[id];
  save(state);
}

// ---------------------------------------------------------------------------
// Control plane: reps
// ---------------------------------------------------------------------------

function listReps() {
  return Object.values(load().reps);
}

function getRep(id) {
  return load().reps[id];
}

function saveRep(rep) {
  const state = load();
  state.reps[rep.id] = rep;
  save(state);
  return rep;
}

// ---------------------------------------------------------------------------
// Control plane: global settings (kill switch, channel pause)
// ---------------------------------------------------------------------------

function getSettings() {
  return load().settings;
}

function updateSettings(patch) {
  const state = load();
  state.settings = { ...state.settings, ...patch, updated_at: new Date().toISOString() };
  save(state);
  return state.settings;
}

// ---------------------------------------------------------------------------
// Intelligence layer: enrollments (one prospect inside one campaign)
// ---------------------------------------------------------------------------

function listEnrollments(filter = {}) {
  const all = Object.values(load().enrollments);
  return all.filter((e) => {
    if (filter.campaign_id && e.campaign_id !== filter.campaign_id) return false;
    if (filter.funnel_stage && e.funnel_stage !== filter.funnel_stage) return false;
    return true;
  });
}

function getEnrollment(id) {
  return load().enrollments[id];
}

function saveEnrollment(enrollment) {
  const state = load();
  state.enrollments[enrollment.id] = enrollment;
  save(state);
  return enrollment;
}

/** Finds any OTHER campaign's enrollment for the same real-world person
 * (matched by linkedin_url, then email, then phone, then name) — this is
 * the "same prospect in two campaigns at once" conflict check from the
 * problem statement. */
function findConflictingEnrollments(prospect, excludeCampaignId) {
  const all = Object.values(load().enrollments);
  return all.filter((e) => {
    if (e.campaign_id === excludeCampaignId) return false;
    const p = e.prospect || {};
    if (prospect.linkedin_url && p.linkedin_url && prospect.linkedin_url === p.linkedin_url) return true;
    if (prospect.email && p.email && prospect.email.toLowerCase() === p.email.toLowerCase()) return true;
    if (prospect.phone && p.phone && normalizePhone(prospect.phone) === normalizePhone(p.phone)) return true;
    if (prospect.name && p.name && prospect.name.toLowerCase() === p.name.toLowerCase()) return true;
    return false;
  });
}

module.exports = {
  // legacy
  getLead,
  upsertLead,
  logEvent,
  allLeads,
  allEvents,
  getLeadByIdentity,
  upsertLeadByIdentity,
  identityKey,
  // control plane
  listCampaigns,
  getCampaign,
  saveCampaign,
  deleteCampaign,
  listReps,
  getRep,
  saveRep,
  getSettings,
  updateSettings,
  // intelligence layer
  listEnrollments,
  getEnrollment,
  saveEnrollment,
  findConflictingEnrollments,
};
