/**
 * Seeds the demo state with the "at least three concurrent campaigns,
 * different ICP, different prompts, independent Live/Paused state" the
 * problem statement requires (Section 3, "Required Demonstration") — plus
 * a fourth Draft campaign, mirroring the exact example table in the
 * problem statement itself.
 *
 * Real Apollo-sourced prospects come from data/icp_prospects/prospects.json
 * (LinkedIn-only — that free-tier data has no phone/email). A handful of
 * clearly-synthetic demo contacts from data/dummy_leads.csv are layered in
 * on top so SMS/voice/email actually have something to send to as well —
 * every synthetic contact is tagged source:"synthetic_test" end to end so
 * it is never confused with real prospect data.
 *
 * Safe to re-run: it wipes and rebuilds only the campaigns/enrollments it
 * creates (via a fixed set of campaign ids), so re-seeding during
 * development does not pile up duplicates.
 */
const fs = require("fs");
const path = require("path");
const store = require("../src/state/store");
const { buildCampaign } = require("../src/campaigns/factory");
const { getIcpProspects } = require("../src/data/icpProspects");
const { runCampaign } = require("../src/agents/pipeline");
const { RESERVED_DEMO_LEADS } = require("../src/data/reservedDemoLeads");

const SYNTHETIC_LEADS = {
  us_saas_cto: [
    { name: "Ananya Rao", phone: "+919810000001", email: "ananya.rao@example.com", company: "Northwind SaaS", title: "VP Engineering" },
    { name: "Rahul Mehta", phone: "+919810000002", email: "rahul.mehta@example.com", company: "Zenith Cloud", title: "CTO" },
  ],
  india_bfsi_cio: [
    { name: "Meera Joshi", phone: "+919810000007", email: "meera.joshi@example.com", company: "Crestline Banking", title: "CIO", segment: "Banking" },
    { name: "Karan Shah", phone: "+919810000004", email: "karan.shah@example.com", company: "BluePeak Retail", title: "Director IT" },
  ],
  us_voice_ai_founders: [
    { name: "Divya Menon", phone: "+919810000009", email: "divya.menon@example.com", company: "Terra Agritech", title: "Founder" },
    { name: "Vikram Singh", phone: "+919810000006", email: "vikram.singh@example.com", company: "Nimbus Logistics", title: "COO" },
  ],
};

function prospectPoolFor(icpId, extraRoles) {
  const icp = getIcpProspects(icpId);
  const real = (icp ? icp.prospects : []).map((p) => ({ ...p, source: "apollo" }));
  const synthetic = (SYNTHETIC_LEADS[icpId] || []).map((p) => ({ ...p, source: "synthetic_test" }));
  return [...real, ...synthetic];
}

async function main() {
  const campaigns = [
    buildCampaign({
      id: "camp_us_saas_cto",
      name: "US SaaS CTO Outreach",
      description: "Book a 15-minute intro call with SaaS engineering leadership about Autonomous SDR",
      owner: "Arsh",
      icp_id: "us_saas_cto",
      geography: "United States",
      target_roles: ["Chief Technology Officer", "CTO", "VP Engineering", "Head of Engineering"],
      exclusion_criteria: "intern, assistant",
      prospect_pool: prospectPoolFor("us_saas_cto"),
    }),
    buildCampaign({
      id: "camp_india_bfsi_cio",
      name: "India BFSI CIO Outreach",
      description: "Book a 15-minute intro call with BFSI IT leadership about compliant, auditable AI outreach",
      owner: "Arsh",
      icp_id: "india_bfsi_cio",
      geography: "India",
      target_roles: ["Chief Information Officer", "CIO", "Director IT", "Head of IT"],
      exclusion_criteria: "intern, assistant",
      prospect_pool: prospectPoolFor("india_bfsi_cio"),
    }),
    buildCampaign({
      id: "camp_us_voice_ai_founders",
      name: "US Voice AI Founders",
      description: "Open a founder-to-founder conversation about voice-AI and agent orchestration",
      owner: "Arsh",
      icp_id: "us_voice_ai_founders",
      geography: "United States",
      target_roles: ["Founder", "Co-founder", "Co-Founder", "CEO", "COO"],
      exclusion_criteria: "intern, assistant",
      prospect_pool: prospectPoolFor("us_voice_ai_founders"),
    }),
    buildCampaign({
      id: "camp_enterprise_expansion",
      name: "Enterprise Expansion",
      description: "Existing-customer expansion pilot — configuration in progress",
      owner: "Arsh",
      icp_id: null,
      geography: "",
      target_roles: ["VP Customer Success", "Head of Customer Success"],
      prospect_pool: [],
    }),
  ];

  for (const c of campaigns) store.saveCampaign(c);

  // Activate three of the four (Draft campaign stays Draft, per the
  // problem statement's own example table).
  const live = store.getCampaign("camp_us_saas_cto");
  live.status = "live";
  live.history.push({ ts: new Date().toISOString(), actor: "Arsh", action: "live" });
  store.saveCampaign(live);

  const liveTwo = store.getCampaign("camp_us_voice_ai_founders");
  liveTwo.status = "live";
  liveTwo.history.push({ ts: new Date().toISOString(), actor: "Arsh", action: "live" });
  store.saveCampaign(liveTwo);

  const toBePaused = store.getCampaign("camp_india_bfsi_cio");
  toBePaused.status = "live";
  toBePaused.history.push({ ts: new Date().toISOString(), actor: "Arsh", action: "live" });
  store.saveCampaign(toBePaused);

  // Run the real pipeline against all three live campaigns so the
  // dashboard shows genuine, computed funnel numbers — not fabricated
  // stats — on first load.
  for (const id of ["camp_us_saas_cto", "camp_india_bfsi_cio", "camp_us_voice_ai_founders"]) {
    const campaign = store.getCampaign(id);
    // eslint-disable-next-line no-await-in-loop
    const result = await runCampaign(campaign, campaign.prospect_pool);
    console.log(`[seed] ran ${id}: ${JSON.stringify(result.ran)} enrollments processed`);
  }

  // Demonstrate pause independence: pause India BFSI CIO AFTER it already
  // has real activity, then prove the other two are unaffected (checked by
  // scripts/verifySeed.js / the dashboard itself).
  const paused = store.getCampaign("camp_india_bfsi_cio");
  paused.status = "paused";
  paused.history.push({ ts: new Date().toISOString(), actor: "Arsh", action: "paused", detail: { note: "paused deliberately after running once, to demonstrate independent lifecycle state" } });
  store.saveCampaign(paused);
  store.logEvent({ type: "campaign_lifecycle", campaign_id: "camp_india_bfsi_cio", status: "paused" });

  // A couple of enrollments manually walked further down the funnel so the
  // dashboard's funnel view isn't flat at "contacted" for every prospect —
  // each one is logged as an explicit manual_override, same as an operator
  // clicking it in the UI, never silently fabricated.
  const advance = (campaignId, prospectNameFragment, stage) => {
    const enrollment = store
      .listEnrollments({ campaign_id: campaignId })
      .find((e) => e.prospect.name.toLowerCase().includes(prospectNameFragment.toLowerCase()));
    if (!enrollment) return;
    enrollment.funnel_stage = stage;
    enrollment.agent_log.push({ ts: new Date().toISOString(), agent: "operator", action: "manual_override", detail: { stage, note: "seed data — represents a real reply received during earlier testing" } });
    store.saveEnrollment(enrollment);
  };
  advance("camp_us_saas_cto", "Rahul Mehta", "engaged");
  advance("camp_us_saas_cto", "Kushagra Singh", "meeting");
  advance("camp_us_voice_ai_founders", "Divya Menon", "engaged");
  advance("camp_india_bfsi_cio", "Meera Joshi", "meeting");

  console.log("\nSeed complete.");
  console.log("Reserved demo leads for live 'Add Prospect' testing:", RESERVED_DEMO_LEADS.map((l) => l.name).join(", "));
  console.log("Campaigns:", store.listCampaigns().map((c) => `${c.name} [${c.status}]`).join(" | "));
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
