// Quick end-to-end test: sends an "opening email" to the first 3 dummy
// leads via sendEmail directly. Safe in mock mode (default) - only sends
// for real if EMAIL_PROVIDER=gmail|resend and the matching creds are set.
const { loadLeadsFromCsv, DEFAULT_CSV } = require("../src/state/leads");
const { sendEmail } = require("../src/email/client");

(async () => {
  const leads = loadLeadsFromCsv(DEFAULT_CSV).slice(0, 3);
  for (const lead of leads) {
    const subject = `Quick question, ${lead.name.split(" ")[0]}`;
    const body = `Hi ${lead.name},\n\nNoticed ${lead.company} is exploring ${lead.interest_area}. Worth a quick 15-min chat this week?\n\n- Autonomous SDR`;
    // eslint-disable-next-line no-await-in-loop
    const result = await sendEmail(lead.email || "no-email-in-csv@example.com", subject, body);
    console.log(`-> ${lead.name}:`, result);
  }
  console.log("\nDone.");
})();
