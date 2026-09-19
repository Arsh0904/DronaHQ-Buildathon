// Sends a real test email via whatever EMAIL_PROVIDER is configured.
// Usage: node scripts/testRealEmail.js "you@example.com" "Subject line"
const { sendEmail } = require("../src/email/client");

const [, , to, subject = "Autonomous SDR - test email", ] = process.argv;
if (!to) {
  console.error('Usage: node scripts/testRealEmail.js "you@example.com" "Subject line"');
  process.exit(1);
}

const body = "This is a live test of the Autonomous SDR email channel (Buildathon 2026). If you're reading this in your inbox, the free email pipeline works end-to-end.";

sendEmail(to, subject, body).then((result) => {
  console.log("Result:", result);
  console.log(`\nCheck ${to}'s inbox.`);
}).catch((err) => {
  console.error("Failed to send:", err.response ? JSON.stringify(err.response.data) : err.message);
  process.exit(1);
});
