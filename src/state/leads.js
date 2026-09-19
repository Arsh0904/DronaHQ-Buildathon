const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

function loadLeadsFromCsv(csvPath) {
  const file = fs.readFileSync(csvPath, "utf8");
  const records = parse(file, { columns: true, skip_empty_lines: true, trim: true });
  return records.map((r) => ({
    name: r.name,
    phone: r.phone, // E.164, e.g. +919876543210
    company: r.company,
    role: r.role,
    interest_area: r.interest_area,
    campaign: r.campaign || "default",
  }));
}

const DEFAULT_CSV = path.join(__dirname, "..", "..", "data", "dummy_leads.csv");

module.exports = { loadLeadsFromCsv, DEFAULT_CSV };
