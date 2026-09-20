/**
 * Builds a new Campaign object (problem statement Section 3: "Campaign as a
 * First-Class Object") — identity, targeting, agent config, and a versioned
 * prompt/harness, all in the Draft state until explicitly activated.
 * Shared by the control-plane API (routes/campaigns.js) and the demo seed
 * script (scripts/seed.js) so both build campaigns the exact same way.
 */
const crypto = require("crypto");
const { defaultPromptsFor } = require("../data/defaultPrompts");

const AGENT_KEYS = ["icp_fitment", "lead_research", "outreach_strategy", "personalization", "conversation", "voice_sdr", "follow_up"];

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function versioned(text, author) {
  return [{ version: 1, text, active: true, created_at: new Date().toISOString(), author: author || "system" }];
}

function buildCampaign({ id, name, description, owner, icp_id, geography, target_roles, exclusion_criteria, company_criteria, channels, daily_limit, agents, prospect_pool }) {
  const now = new Date().toISOString();
  const objective = description || "Book a 15-minute intro call";
  const defaults = defaultPromptsFor(name, objective);
  const enabledChannels = { sms: true, voice: true, email: true, linkedin: true, ...(channels || {}) };
  const enabledAgents = AGENT_KEYS.reduce((acc, k) => ({ ...acc, [k]: agents && k in agents ? Boolean(agents[k]) : true }), {});

  return {
    id: id || newId("camp"),
    name,
    description: description || "",
    owner: owner || "unassigned",
    status: "draft",
    created_at: now,
    updated_at: now,
    targeting: {
      icp_id: icp_id || null,
      geography: geography || "",
      target_roles: target_roles || [],
      company_criteria: company_criteria || "",
      exclusion_criteria: exclusion_criteria || "",
    },
    agents: enabledAgents,
    channels: enabledChannels,
    daily_limit: daily_limit || 25,
    reps: [],
    prospect_pool: prospect_pool || [],
    prompts: {
      system: versioned(defaults.system, owner),
      agents: AGENT_KEYS.reduce((acc, k) => ({ ...acc, [k]: versioned(defaults.agents[k], owner) }), {}),
    },
    history: [{ ts: now, actor: owner || "system", action: "created", detail: { status: "draft" } }],
  };
}

module.exports = { buildCampaign, AGENT_KEYS };
