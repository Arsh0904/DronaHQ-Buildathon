const express = require("express");
const { loadLeadsFromCsv, DEFAULT_CSV } = require("../state/leads");
const { runVoiceCampaign } = require("../agents/voiceSdrAgent");
const { startConversation } = require("../agents/conversationAgent");
const store = require("../state/store");

const router = express.Router();

// Simple in-memory campaign registry for the demo. The team's real control
// plane owns full campaign CRUD/lifecycle (Section 3 of the problem
// statement); this service only needs enough of a "campaign" shape to run
// and attribute the voice/SMS channels correctly.
const campaigns = {
  demo: { id: "demo", name: "Demo Outreach", objective: "Book a 15-min product demo" },
};

router.get("/", (req, res) => res.json(Object.values(campaigns)));

router.post("/:id/sms/start", async (req, res) => {
  const campaign = campaigns[req.params.id] || { id: req.params.id, name: req.params.id, objective: "sales outreach" };
  const csvPath = req.body.csvPath || DEFAULT_CSV;
  const leads = loadLeadsFromCsv(csvPath).filter((l) => !req.body.campaign || l.campaign === req.body.campaign);

  const results = [];
  for (const lead of leads) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const decision = await startConversation(campaign, lead);
      results.push({ phone: lead.phone, ok: true, decision });
    } catch (err) {
      console.error(`[campaigns] startConversation failed for ${lead.phone}: ${err.message}`);
      results.push({ phone: lead.phone, ok: false, error: err.message });
    }
  }
  res.json({ campaign: campaign.id, sent: results.length, results });
});

router.post("/:id/voice/start", async (req, res) => {
  const campaign = campaigns[req.params.id] || { id: req.params.id, name: req.params.id, objective: "sales outreach" };
  const csvPath = req.body.csvPath || DEFAULT_CSV;
  const leads = loadLeadsFromCsv(csvPath).filter((l) => !req.body.campaign || l.campaign === req.body.campaign);

  try {
    const result = await runVoiceCampaign(campaign.id, leads);
    res.json({ campaign: campaign.id, dispatch: result });
  } catch (err) {
    console.error(`[campaigns] runVoiceCampaign failed: ${err.message}`);
    res.status(502).json({ campaign: campaign.id, error: err.message });
  }
});

router.get("/:id/status", (req, res) => {
  const leads = store.allLeads().filter((l) => l.campaign_id === req.params.id);
  res.json({ campaign: req.params.id, leads });
});

router.get("/:id/events", (req, res) => {
  const events = store.allEvents().filter((e) => e.campaign_id === req.params.id || !e.campaign_id);
  res.json({ campaign: req.params.id, events });
});

module.exports = router;
