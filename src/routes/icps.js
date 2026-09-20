const express = require("express");
const { listIcps, getIcpProspects } = require("../data/icpProspects");
const { outreachBatch, outreachLead } = require("../outreach/dispatcher");
const store = require("../state/store");

const router = express.Router();

// GET /api/icps - list all ICPs with real matched-market counts
router.get("/", (req, res) => {
  res.json(listIcps());
});

// GET /api/icps/:id - the real prospect list for one ICP
router.get("/:id", (req, res) => {
  const icp = getIcpProspects(req.params.id);
  if (!icp) return res.status(404).json({ error: `Unknown ICP: ${req.params.id}` });
  res.json(icp);
});

// POST /api/icps/:id/outreach - fire real 4-channel outreach at this ICP's
// prospects (or a caller-supplied lead list in req.body.leads, which lets
// a tester point it at their own contact info instead of the Apollo pool).
router.post("/:id/outreach", async (req, res) => {
  const icp = getIcpProspects(req.params.id);
  if (!icp && !req.body.leads) {
    return res.status(404).json({ error: `Unknown ICP: ${req.params.id}` });
  }
  const leads = req.body.leads || icp.prospects;
  const limited = req.body.limit ? leads.slice(0, req.body.limit) : leads;
  const campaign = { id: req.params.id, name: (icp && icp.name) || req.params.id, objective: req.body.objective || "Book a 15-min product demo" };

  try {
    const results = await outreachBatch(campaign, limited);
    res.json({ campaign: campaign.id, dispatched: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/icps/:id/status - state + events for everyone contacted under this ICP/campaign
router.get("/:id/status", (req, res) => {
  const leads = store.allLeads().filter((l) => l.campaign_id === req.params.id);
  res.json({ campaign: req.params.id, leads });
});

module.exports = router;
