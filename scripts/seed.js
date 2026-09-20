/**
 * Manual re-seed for local development: `npm run seed`.
 * See src/bootstrap/seedDemoData.js for what this actually builds — the
 * server calls the same function automatically on boot if it finds no
 * campaigns yet, so this script is only needed to force a fresh reset.
 */
const { seedDemoData } = require("../src/bootstrap/seedDemoData");

seedDemoData()
  .then(() => console.log("\nSeed complete."))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
