// Quick end-to-end test: dispatches a voice campaign against the dummy
// dataset WITHOUT starting the HTTP server. Safe in mock mode (default).
const { loadLeadsFromCsv, DEFAULT_CSV } = require("../src/state/leads");
const { runVoiceCampaign } = require("../src/agents/voiceSdrAgent");

(async () => {
  const leads = loadLeadsFromCsv(DEFAULT_CSV).slice(0, 3);
  const result = await runVoiceCampaign("demo", leads);
  console.log("Dispatch result:", result);
  console.log("\nDone. Check data/state.json for the saved lead records.");
})();
