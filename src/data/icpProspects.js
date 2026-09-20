/**
 * ICP -> real prospect data layer (Section 3/4 "who to outreach given an
 * ICP" in the problem statement). Real names sourced from Apollo.io for
 * three example ICPs the problem statement itself names: US SaaS CTO,
 * India BFSI CIO, US Voice AI founders.
 *
 * Two paths, same shape:
 *  - No APOLLO_API_KEY configured (default): serves the pre-fetched real
 *    Apollo results baked into data/icp_prospects/prospects.json. This is
 *    what a free Apollo account can produce without hitting the paid-only
 *    structured search API - the Apollo "AI agent" search still works on
 *    a free plan and returned real people (verified while building this).
 *  - APOLLO_API_KEY configured: calls Apollo's real People Search API
 *    directly for a live, unbounded ICP query instead of the fixed three.
 */
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const config = require("../config");

const PROSPECTS_FILE = path.join(__dirname, "..", "..", "data", "icp_prospects", "prospects.json");

function loadBakedIcps() {
  return JSON.parse(fs.readFileSync(PROSPECTS_FILE, "utf8"));
}

function listIcps() {
  const data = loadBakedIcps();
  return Object.values(data).map((icp) => ({
    icp_id: icp.icp_id,
    name: icp.name,
    description: icp.description,
    source: icp.source,
    total_market_size: icp.total_market_size,
    prospects_available: icp.prospects.length,
  }));
}

function getIcpProspects(icpId) {
  const data = loadBakedIcps();
  const icp = data[icpId];
  if (!icp) return null;
  return icp;
}

/**
 * Live path: given free-text ICP criteria, hits Apollo's real People
 * Search API directly (requires the user's own APOLLO_API_KEY - the free
 * plan's own key still works for this, unlike the read-only MCP tool used
 * to seed the three baked ICPs above, which route through a different,
 * gated endpoint on some plans).
 */
async function searchIcpLive({ personTitles, organizationLocations, keywordTags, perPage = 10 }) {
  if (!config.apollo.isLive) {
    throw new Error("APOLLO_API_KEY not configured - set it in .env to search ICPs beyond the three baked-in examples.");
  }
  const { data } = await axios.post(
    "https://api.apollo.io/api/v1/mixed_people/search",
    {
      person_titles: personTitles,
      organization_locations: organizationLocations,
      q_organization_keyword_tags: keywordTags,
      per_page: perPage,
    },
    { headers: { "x-api-key": config.apollo.apiKey, "Content-Type": "application/json" } }
  );
  return (data.people || []).map((p) => ({
    name: p.name,
    title: p.title,
    company: p.organization && p.organization.name,
    linkedin_url: p.linkedin_url || null,
    email: p.email || null,
  }));
}

module.exports = { listIcps, getIcpProspects, searchIcpLive };
