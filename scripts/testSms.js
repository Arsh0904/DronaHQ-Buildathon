// Quick end-to-end test: runs the SMS conversation agent against the dummy
// dataset WITHOUT starting the HTTP server. Safe in mock mode (default).
const { loadLeadsFromCsv, DEFAULT_CSV } = require("../src/state/leads");
const { startConversation } = require("../src/agents/conversationAgent");

(async () => {
  const leads = loadLeadsFromCsv(DEFAULT_CSV).slice(0, 3); // just the first 3
  const campaign = { id: "demo", name: "Demo Outreach", objective: "Book a 15-min product demo" };
  for (const lead of leads) {
    // eslint-disable-next-line no-await-in-loop
    const decision = await startConversation(campaign, lead);
    console.log(`-> ${lead.name} (${lead.phone}):`, decision);
  }
  console.log("\nDone. Check data/state.json for the saved lead records.");
})();
