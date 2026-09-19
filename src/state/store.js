// Minimal, dependency-free "database" for the buildathon: a JSON file on
// disk. Good enough to demonstrate campaign/lead state and swap for a real
// DB (or the team's shared CRM/control-plane store) later without touching
// the agent logic above it.
const fs = require("fs");
const path = require("path");

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
  return state.leads[phone];
}

function upsertLead(phone, patch) {
  const state = load();
  state.leads[phone] = { ...(state.leads[phone] || {}), ...patch, phone };
  save(state);
  return state.leads[phone];
}

function logEvent(event) {
  const state = load();
  state.events.push({ ts: new Date().toISOString(), ...event });
  save(state);
}

function allLeads() {
  return Object.values(load().leads);
}

function allEvents() {
  return load().events;
}

module.exports = { getLead, upsertLead, logEvent, allLeads, allEvents };
