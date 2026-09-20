/**
 * Synthetic, clearly-fake demo contacts (data/dummy_leads.csv sourced)
 * deliberately NOT pre-enrolled in any seeded campaign, so the dashboard's
 * "Add Prospect" flow has real candidates to run the ICP Fitment Agent
 * against live, in front of judges, instead of only ever showing
 * pre-computed seed data.
 */
const RESERVED_DEMO_LEADS = [
  { name: "Priya Nair", phone: "+919810000003", email: "priya.nair@example.com", company: "Falcon Fintech", title: "Head of Product" },
  { name: "Sneha Iyer", phone: "+919810000005", email: "sneha.iyer@example.com", company: "Orbit Health", title: "VP Operations" },
  { name: "Aditya Kapoor", phone: "+919810000008", email: "aditya.kapoor@example.com", company: "Skyline Media", title: "Head of Growth" },
  { name: "Arjun Reddy", phone: "+919810000010", email: "arjun.reddy@example.com", company: "Vertex Robotics", title: "VP Sales" },
];

module.exports = { RESERVED_DEMO_LEADS };
