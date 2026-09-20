# Autonomous SDR — Control Plane + Intelligence Layer

Built for the **Inter Guild Buildathon 2026** (IIT Madras × DronaHQ).

Live: **https://sdr-buildathon.onrender.com**
Repo: **https://github.com/Arsh0904/DronaHQ-Buildathon**

A multi-campaign, multi-channel autonomous SDR: a **control plane** for
managing several concurrent GTM campaigns (each with its own ICP, prompts,
lifecycle and pause controls) sitting on top of an **intelligence layer** of
seven cooperating agents that qualify, research, plan outreach for,
personalise messages to, converse with, call, and follow up on prospects —
across SMS, voice, email and LinkedIn.

See `REPORT.md` for the full write-up (approach, architecture, what's fully
working vs partial vs skipped, and known limitations).

## What's actually running

Open the live URL and you'll see the real dashboard, not a mockup:

- **4 concurrent campaigns**, independently controllable — 3 `live`/`paused`,
  1 `draft` — each targeting a different ICP (US SaaS CTOs, India BFSI CIOs,
  US Voice-AI founders, plus a draft "Enterprise Expansion" pilot).
- **Global kill switch** and **per-channel pause** (sms/voice/email/linkedin)
  in the header, enforced by the pipeline on every run — not just a UI toggle.
- Per-campaign **Pause / Resume / Mark Completed / Archive / Duplicate as
  Variant**, a full lifecycle history log, and a live prospect funnel
  (discovered → researched → qualified/disqualified → contacted → engaged →
  meeting → opportunity).
- **Versioned, roll-back-able prompts** per campaign — a system prompt plus
  one prompt per agent — editable and revertible from the "Prompts &
  Harness" tab.
- An **"Add Prospect"** flow that runs the real ICP Fitment agent live in
  front of you (try a demo lead that doesn't fit a campaign's target roles —
  it gets disqualified for a real, inspectable reason, not a canned one).
- Every prospect is tagged by where it came from: `apollo` (real, sourced via
  Apollo.io and frozen into the repo as a seed dataset), `synthetic_test`
  (fake contacts with real-looking phone/email so SMS/voice/email have
  something safe to send to), or `manual` (added live through the UI).

## Architecture

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

**How DronaHQ is used:** the Conversation Agent decides what to do with an
inbound SMS reply (send / escalate / stop / book a meeting) via a Webhook
Trigger, and the Voice Agent runs the actual outbound call once dispatched.
Both are genuinely load-bearing — this service does not write sales replies
itself when DronaHQ is live. When DronaHQ's response envelope comes back
empty (a known gap under real network conditions), the **Personalisation
agent** falls back to a locally-generated, knowledge-grounded template so a
demo run never silently stalls — every message is tagged with its real
`source` (`dronahq_conversation_agent` vs `template_fallback`) so nothing is
misrepresented as more "AI-generated" than it is.

## Setup

```powershell
cd C:\Users\ADMIN\Documents\sdr-buildathon
npm install
Copy-Item .env.example .env
```

Everything runs in **mock mode** with the placeholder `.env` values —
nothing real gets sent/called until you fill in live credentials. See
`.env.example` for every variable (Twilio, DronaHQ Voice + Conversation
webhook, SMS/email provider choice).

## Run it

```powershell
npm start          # starts the server; auto-seeds demo campaigns if data/state.json is empty
```

Open `http://localhost:3000` for the dashboard. To force a fresh reset of
the demo data at any time:

```powershell
npm run seed
```

Useful direct-agent test scripts (bypass the HTTP layer, exercise
Twilio/DronaHQ/email clients directly):

```powershell
npm run test:sms
npm run test:voice
npm run test:email
```

### Deploying

`render.yaml` is a Render Blueprint — connect the repo and Render will build
and run `npm start`. **Render's free tier wipes the filesystem on every
redeploy**, which is why the server auto-seeds `data/state.json` with the
full demo dataset (4 campaigns, real + synthetic prospects, a pipeline
already run against them) on boot if it finds no campaigns — a fresh deploy
is never an empty app.

## Folder structure

```
sdr-buildathon/
├── src/
│   ├── server.js              # Express app entrypoint; serves public/, mounts routes, auto-seeds on boot
│   ├── config.js              # env loading + mock/live detection per integration
│   ├── campaigns/
│   │   └── factory.js         # buildCampaign() — shared campaign-construction logic (routes + seeder)
│   ├── agents/
│   │   ├── pipeline.js        # the intelligence layer: all 7 agents + enrollment/run orchestration
│   │   ├── conversationAgent.js  # legacy: SMS opener + DronaHQ-driven reply handling
│   │   └── voiceSdrAgent.js      # legacy: dispatch calls, pre/post-call context
│   ├── knowledge/
│   │   └── kb.js               # dependency-free keyword-retrieval "RAG" over data/knowledge/*.md
│   ├── data/
│   │   ├── defaultPrompts.js   # default system + per-agent prompt text for a new campaign
│   │   ├── icpProspects.js     # loads the real Apollo-sourced prospect pools
│   │   └── reservedDemoLeads.js # 4 synthetic leads for the live "Add Prospect" demo
│   ├── routes/
│   │   ├── campaigns.js        # campaign CRUD, lifecycle transitions, prompts/versions, enrollments, run/follow-up
│   │   ├── control.js          # kill switch, channel pause, reps, demo-lead list
│   │   ├── icps.js             # ICP metadata
│   │   └── webhooks.js         # Twilio inbound SMS, DronaHQ pre/post-call webhooks
│   ├── bootstrap/
│   │   └── seedDemoData.js     # builds the 4 demo campaigns; seedIfEmpty() called on server boot
│   ├── dronahq/client.js       # DronaHQ Voice dispatch + Conversation Agent webhook calls
│   ├── twilio/client.js        # Twilio SMS send
│   ├── email/client.js         # Resend / Gmail SMTP send
│   ├── linkedin/client.js      # assisted deep-link generation (human-in-the-loop, no automated login)
│   ├── outreach/dispatcher.js  # per-channel send wrappers with error isolation
│   └── state/
│       ├── store.js            # JSON-file store: campaigns, reps, settings, enrollments + legacy lead/event data
│       ├── leads.js            # legacy CSV loader
│       └── phone.js            # phone number normalization
├── data/
│   ├── icp_prospects/prospects.json  # real Apollo-sourced prospects for the 3 seeded ICPs (20 total)
│   ├── knowledge/*.md          # product pitch, objection handling, example messages, voice script — the RAG corpus
│   ├── dummy_leads.csv         # legacy single-channel demo dataset
│   └── state.json              # generated at runtime, gitignored
├── public/                     # the control-plane dashboard: vanilla JS SPA, no build step
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scripts/
│   ├── seed.js                 # `npm run seed` — force-reseed demo data
│   ├── testSms.js / testVoice.js / testEmail.js   # mock-safe direct-agent tests
│   └── testRealNumber.js / testRealEmail.js        # opt-in real-send tests
├── render.yaml                 # Render Blueprint
└── .env.example
```

## Known limitations / trade-offs

- **Voice calling is built and published in DronaHQ but not dialing for
  real** — outbound calling requires linking a real Twilio/Plivo/SIP-trunk
  phone number in DronaHQ's Call Configuration, which needs a paid telephony
  account. The dispatch endpoint, orchestration, and per-call logging are
  all real; only the last hop (an actual ringing phone) is gated behind that
  paid step.
- **"RAG" is keyword/bag-of-words retrieval**, not embeddings — a
  deliberate, dependency-free stand-in documented as such in `src/knowledge/kb.js`,
  not represented as a vector database.
- **`data/state.json` is a flat JSON file**, fine for a buildathon demo;
  swap for a real database before any production use, and note Render's
  free tier resets it on every redeploy (handled today via auto-seeding).
- **LinkedIn is deliberately not fully automated** — it produces an assisted
  deep-link for a human to send, rather than driving a logged-in browser
  session, to avoid LinkedIn ToS / account-ban risk.
- **Apollo.io prospects are a frozen seed dataset** (20 real people across 3
  ICPs), not a live search — the live search path exists in
  `src/data/icpProspects.js` but is not wired to a paid Apollo API key in
  this deployment, so the demo never depends on live API quota.
