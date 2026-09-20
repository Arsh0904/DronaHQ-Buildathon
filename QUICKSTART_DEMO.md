# Quickstart: run + demo this to your team

## LIVE DEPLOYMENT

**https://sdr-buildathon.onrender.com** — deployed on Render, real email (Resend) confirmed working.
Note: free-tier instance spins down after inactivity; first request after idle can take ~50s.

Verified working end-to-end on 2026-09-20 (all 4 outreach channels + the
ICP data layer, running fully in free/mock-safe mode, no paid accounts).

## 1. Run it

```
npm install        # only needed once
npm start
```

You should see:
```
sdr-voice-sms-agent listening on http://localhost:3000
Twilio live: false
DronaHQ voice live: false
DronaHQ conversation live: false
Running in MOCK MODE for any unconfigured integration above - safe to test end-to-end.
```

That's expected — every channel works right now in mock/free mode. Flip
each to "live" by filling in `.env` (copy from `.env.example`); nothing
else changes.

## 2. The ICP data layer (real people, not fabricated)

```
curl http://localhost:3000/api/icps
```
Lists the 3 example ICPs from the problem statement, each with a REAL
total market size from Apollo.io and a preview of real named prospects:
- `us_saas_cto` — 16,761 real matches
- `india_bfsi_cio` — 627 real matches (segmented: Banking/NBFC/Insurance/Fintech)
- `us_voice_ai_founders` — 2,777 real matches

```
curl http://localhost:3000/api/icps/india_bfsi_cio
```
Returns the full baked prospect list (name, title, company, LinkedIn URL,
Apollo profile link) for that ICP.

To go beyond the 3 baked examples with a live Apollo query, set
`APOLLO_API_KEY` in `.env` (free-plan key works).

## 3. Fire real 4-channel outreach at a dataset

Point it at the ICP's own prospect pool:
```
curl -X POST http://localhost:3000/api/icps/india_bfsi_cio/outreach \
  -H "Content-Type: application/json" \
  -d '{"limit": 2, "objective": "Book a 15-min demo"}'
```

Or point it at YOUR OWN test contacts (this is how your 2 testers get
outreached) — only channels with a real address on the lead fire:
```
curl -X POST http://localhost:3000/api/icps/team_demo/outreach \
  -H "Content-Type: application/json" \
  -d '{
    "leads": [
      {"name": "Your Name", "phone": "+91XXXXXXXXXX", "email": "you@example.com", "linkedin_url": "https://linkedin.com/in/you"}
    ],
    "objective": "Book a 15-min demo"
  }'
```
This asks the (mock, unless DronaHQ is configured) conversation agent for
one personalised message, then actually sends it down every channel the
lead has: SMS (Textbelt, free, real), email (Resend/Gmail if configured,
else mock), a LinkedIn compose deep-link (assisted mode — no bot risk),
and a voice-call dispatch (DronaHQ, mock unless configured).

Check what happened:
```
curl http://localhost:3000/api/icps/team_demo/status
```

## 4. Make SMS actually land on a phone right now (free, no signup)

```
SMS_PROVIDER=textbelt npm start
```
then re-run the outreach POST above with a real `phone`. Textbelt's free
key is a global demo key capped at 1 SMS/day shared by everyone using it
— if it fails with a quota error, get your own free key at textbelt.com
and set `TEXTBELT_API_KEY`.

## 5. Make email actually land in an inbox right now (free, no signup)

Sign up free at resend.com -> API Keys, then in `.env`:
```
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
```
No domain verification needed — it sends from `onboarding@resend.dev` to
any address.

## What's mock vs. real right now

| Channel  | Provider          | Real by default? |
|----------|--------------------|-------------------|
| SMS      | Textbelt           | Yes (shared free quota) |
| Email    | Resend / Gmail     | No — needs 1 free signup (§5) |
| Voice    | DronaHQ Voice Agent| No — needs DronaHQ credentials |
| LinkedIn | Assisted deep-link | Yes (opens a pre-filled compose link — no bot, no ToS risk) |
| ICP data | Apollo.io          | Yes — real named prospects, already baked in |

## Deploying to Render

`render.yaml` is committed at the repo root (Blueprint-ready). Render
needs this repo on GitHub/GitLab to deploy from — push it to a repo you
create, then in Render: New -> Blueprint -> pick that repo. It will read
`render.yaml` automatically; paste your real keys for the `sync: false`
env vars in the Render dashboard (never in git).
