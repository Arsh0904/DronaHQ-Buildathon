# Product: Autonomous SDR Platform

Autonomous SDR is a multi-channel outreach platform that runs Sales Development as a coordinated system of AI agents instead of a team of manual reps. One control plane lets a GTM manager launch and monitor several campaigns at once, each aimed at its own ideal-customer profile. Underneath, an intelligence layer of specialised agents researches each prospect, decides how and when to reach them, personalises the outreach, and follows up automatically across SMS, voice, email and LinkedIn.

## Why a CTO cares
Engineering leaders evaluate this as an integration and reliability problem, not a sales-copy problem. The platform is built with per-lead failure isolation (one bad send never takes down a batch or the rest of a campaign), a full audit trail of which prompt version produced which outbound message, and a kill switch at the campaign, agent, channel and global level. It plugs into existing lead sources (Apollo-style enrichment) and CRMs rather than replacing them.

## Why a CIO at a regulated bank or NBFC cares
Every autonomous action is logged with the exact prompt/harness version active at the time, so a compliance review can answer "why did the system say that" for any single message. Campaigns are isolated from each other: a prompt change in one campaign cannot silently change another's behaviour. A global suppression list and do-not-contact policy sit above every campaign.

## Why a voice-AI founder cares
The Voice SDR agent is itself an example of the category this platform's founders are building in — it is an outbound voice agent that qualifies, handles objections, and escalates to a human when a conversation needs one. It is a natural business-development / integration-partnership conversation, not a cold pitch.

## The one-line pitch
"One SDR working across every channel, not five disconnected bots — with a manager who can see, pause and audit everything it does."
