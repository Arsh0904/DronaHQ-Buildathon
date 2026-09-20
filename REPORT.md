# Autonomous SDR — Buildathon Report

**Inter Guild Buildathon 2026 · IIT Madras × DronaHQ**
Live: https://sdr-buildathon.onrender.com · Repo: https://github.com/Arsh0904/DronaHQ-Buildathon

## 1. Problem & approach

The problem statement asks for an autonomous SDR made of two integrated
halves: a **control plane** that a GTM manager can use to run several
campaigns at once, each with its own targeting, prompts and pause controls;
and an **intelligence layer** of seven cooperating agents (plus retrieval)
that actually qualifies, researches, personalises for, converses with and
follows up on prospects across multiple channels.

Our approach, in priority order:

1. **Build the control plane and intelligence layer as first-class,
   separately-testable systems**, not a demo script — so a judge can open
   the dashboard, click into any of 3 concurrent live/paused campaigns, and
   see a real, independently-computed funnel for each one.
2. **Never fabricate data.** Every prospect carries a `source` tag —
   `apollo` (real people, sourced via Apollo.io and frozen into the repo as
   a seed dataset so the demo never depends on live API quota),
   `synthetic_test` (fake contacts with realistic-looking phone/email so
   SMS/voice/email have something safe to exercise), or `manual` (added
   live through the dashboard). Funnel numbers are computed by actually
   running the pipeline against this data, never hardcoded.
3. **Make every failure mode visible and honest rather than hidden.** Where
   a real integration is gated behind something outside our control (see
   §5), the UI says so plainly instead of faking success.
4. **Design deterministic fallbacks around known integration gaps** so a
   live demo never silently stalls (see the Personalisation agent, §3).

## 2. System architecture

```
                          ┌───────────────────────────────┐
                          │        Control Plane           │
                          │  (public/, src/routes/*.js)     │
                          │                                 │
                          │  campaigns · lifecycle state    │
                          │  versioned prompts · reps       │
                          │  kill switch · channel pause     │
                          └───────────────┬─────────────────┘
                                          │ enrolls prospects,
                                          │ runs the pipeline
                                          ▼
                          ┌───────────────────────────────┐
                          │      Intelligence Layer         │
                          │      (src/agents/pipeline.js)   │
                          │                                 │
                          │  1. ICP Fitment                 │
                          │  2. Lead Research & Enrichment  │
                          │  3. Outreach Strategy           │
                          │  4. Personalisation  ──┐         │
                          │  5. Conversation       │         │
                          │  6. Voice SDR          │ RAG:    │
                          │  7. Follow-up          │ src/    │
                          │                        │ knowledge│
                          └───────────┬────────────┴─────────┘
                                      │ fan-out per prospect,
                                      │ per campaign's enabled channels
                        ┌─────────────┼─────────────┬─────────────┐
                        ▼             ▼             ▼             ▼
                   ┌────────┐   ┌──────────┐   ┌────────┐   ┌──────────┐
                   │  SMS   │   │  Voice   │   │ Email  │   │ LinkedIn │
                   │ Twilio │   │ DronaHQ  │   │ Resend │   │ deep-link│
                   │        │   │  Voice   │   │        │   │ (human-  │
                   │        │   │  Agent   │   │        │   │ in-loop) │
                   └────────┘   └──────────┘   └────────┘   └──────────┘
```

**Control plane** (Section 3 of the PS): campaigns are first-class objects
with a Draft → Live → Paused → Completed/Archived lifecycle, versioned and
roll-back-able prompts (a system prompt plus one prompt per agent, each with
full version history), and four levels of pause: per-campaign, per-agent,
per-channel (platform-wide), and a global kill switch. Enrolling the same
real person (matched by LinkedIn URL / email / phone / name) into two
campaigns at once is detected and flagged, not silently allowed.

**Intelligence layer** (Section 4 of the PS): seven agents run as an
explicit, logged pipeline that advances a prospect through a funnel —
`discovered → researched → qualified/disqualified → contacted → engaged →
meeting → opportunity` — with every stage transition recorded as an
inspectable event. "Retrieval" is a dependency-free keyword/bag-of-words
scorer over a small markdown knowledge base (product pitch, objection
handling, example messages, voice script) — deliberately not embeddings,
and documented as a stand-in for a real vector DB rather than presented as
one.

## 3. Agents built

| # | Agent | What it does |
|---|-------|---------------|
| 1 | **ICP Fitment** | Scores a prospect against the campaign's target roles, exclusion keywords and geography; qualifies or rejects with a real, inspectable reason (not a canned one — try the live "Add Prospect" demo). |
| 2 | **Lead Research & Enrichment** | Builds a short structured summary from the fields available on the prospect. |
| 3 | **Outreach Strategy** | Decides which channel(s) to use and in what order, filtered by what's enabled for the campaign, not globally paused, and actually usable (the prospect has a matching phone/email/LinkedIn URL). |
| 4 | **Personalisation** | Retrieves grounded context via the knowledge layer and calls DronaHQ's Conversation Agent. If DronaHQ's response envelope comes back with no real content — a known gap under real network/async conditions — it falls back to a locally-generated, knowledge-grounded template rather than stalling. Every message is tagged with its real source (`dronahq_conversation_agent` vs `template_fallback`). |
| 5 | **Conversation** | Reads an inbound reply and decides: send, escalate to a human, stop, or mark a meeting booked — via DronaHQ's Webhook Trigger. |
| 6 | **Voice SDR** | Runs the outbound call through a published DronaHQ Voice Agent, per a documented voice script; qualifies, handles objections, escalates. |
| 7 | **Follow-up** | Sends one polite follow-up if a contacted prospect hasn't replied; disqualifies as unresponsive after two follow-ups rather than nudging indefinitely. |

## 4. Campaigns demonstrated

Four concurrent campaigns are seeded on boot, satisfying the "at least 3
concurrent campaigns with independent Live/Paused state" requirement:

- **US SaaS CTO Outreach** — live, 5 real Apollo prospects + 2 synthetic test contacts.
- **India BFSI CIO Outreach** — paused (independently of the other campaigns), 10 real Apollo prospects + 2 synthetic.
- **US Voice-AI Founders** — live, 5 real Apollo prospects + 2 synthetic.
- **Enterprise Expansion** — draft, empty pool, for demonstrating campaign creation/activation live.

Pausing one never touches the others — each campaign's pipeline run is
gated independently on its own `status`, plus the global kill switch and
per-channel pause as an additional cross-cutting layer.

## 5. How DronaHQ is used, and what's fully working vs partial vs skipped

| Capability | Status | Detail |
|---|---|---|
| DronaHQ Conversation Agent (SMS reply decisions) | **Working** | Live webhook call; response envelope safely parsed; never fabricates a "send" if DronaHQ returns nothing. |
| DronaHQ Voice Agent — build, publish, dispatch | **Working** | Agent is built, published, and the outbound dispatch endpoint is live and called by the pipeline. |
| DronaHQ Voice Agent — an actual phone ringing | **Blocked on a paid step, not by our code** | Outbound calling requires linking a real Twilio/Plivo/SIP-trunk number under DronaHQ's Call Configuration → Outbound Settings, which needs a funded telephony account. We surfaced this via a real error message rather than hiding it; the rest of the voice path (config, dispatch, logging) is real. |
| Control plane (campaigns, lifecycle, prompts, kill switch, channel pause) | **Working** | Full CRUD + versioning + enforcement, exercised end-to-end in the deployed dashboard. |
| Intelligence layer (7 agents, funnel tracking) | **Working** | Real pipeline execution against real + synthetic data; funnel counts are computed, not hardcoded. |
| Twilio SMS | **Working (sandbox)** | Live two-way reply loop; sender currently limited to the verified trial account owner. |
| Resend email | **Working (sandbox)** | Live transactional send; limited to the verified account owner on the free tier. |
| LinkedIn | **Working by design, semi-automated** | Deliberately an assisted deep-link rather than a driven logged-in session, to avoid ToS/account-ban risk. |
| "RAG" retrieval | **Working, honestly scoped** | Keyword/bag-of-words retrieval over a markdown knowledge base — not embeddings, not skipped, just accurately labeled. |
| Live Apollo.io search | **Skipped for the demo, path exists** | `src/data/icpProspects.js` has the integration point; the demo uses a frozen, verified 20-prospect seed dataset instead of live API calls, so it never depends on live quota mid-demo. |

## 6. Known limitations / trade-offs

- Voice calling needs a real, funded telephony number linked in DronaHQ —
  an external, paid dependency, not an engineering gap in this repo.
- The knowledge retrieval layer is keyword-based, not vector/embedding-based.
- State is a flat JSON file (`data/state.json`), reset on every Render
  free-tier redeploy — mitigated by auto-seeding on boot, not a permanent
  datastore.
- SMS and email are both sandboxed to verified/owner addresses on their
  respective free tiers.
- LinkedIn outreach is human-in-the-loop by design, not fully autonomous.

See `README.md` for setup, run instructions, and the full folder structure.
