// Sends a real opening SMS to ONE phone number via the actual pipeline
// (same code path as a live campaign), for demoing to the team.
// Usage: node scripts/testRealNumber.js "+919967568270" "Your Name" "Your Company"
const { startConversation } = require("../src/agents/conversationAgent");

const [, , phone, name = "Test Lead", company = "Test Co"] = process.argv;
if (!phone) {
  console.error('Usage: node scripts/testRealNumber.js "+91XXXXXXXXXX" "Name" "Company"');
  process.exit(1);
}

const lead = { name, phone, company, role: "Founder", interest_area: "AI agents" };
const campaign = { id: "live-demo", name: "Live Demo", objective: "Book a 15-min product demo" };

startConversation(campaign, lead).then((decision) => {
  console.log("Decision:", decision);
  console.log(`\nCheck your phone (${phone}) for the SMS.`);
}).catch((err) => {
  console.error("Failed to send:", err.message);
  process.exit(1);
});
