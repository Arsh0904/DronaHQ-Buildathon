// Minimal, dependency-free "database" for the buildathon: a JSON file on
// disk. Good enough to demonstrate campaign/lead state and swap for a real
// DB (or the team's shared CRM/control-plane store) later without touching
// the agent logic above it.
const fs = require("fs");
const path = require("path");
const { normalizePhone } = require("./phone");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "state.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { leads: {}, events: [] };
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

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
  throw new Error("Lead has no phone, email, or linkedin_url to key on");
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

module.exports = { getLead, upsertLead, logEvent, allLeads, allEvents, getLeadByIdentity, upsertLeadByIdentity, identityKey };
