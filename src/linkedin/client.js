/**
 * LinkedIn channel.
 *
 * There is no public, self-serve API for sending LinkedIn messages or
 * connection requests - doing that for real requires driving a logged-in
 * LinkedIn session through a browser (what commercial tools like
 * PhantomBuster/Expandi do), which risks the account being rate-limited or
 * restricted if automated at scale. So this module runs in two modes:
 *
 *  - "assisted" (default, always safe): builds the personalized message and
 *    a pre-filled LinkedIn compose deep link. A human (or a supervised,
 *    one-at-a-time browser-automation step - not this deployed server)
 *    clicks it to actually send. This is what ships to Render.
 *  - "logged" : same, but also records the attempt in state/events so the
 *    control-plane dashboard shows LinkedIn as a coordinated channel next
 *    to email/SMS/voice, exactly like the others.
 *
 * A real, supervised send (one message, on explicit human trigger, via a
 * connected browser session) is a separate, non-deployed capability - see
 * README "LinkedIn channel" section.
 */
const store = require("../state/store");

function buildComposeLink(profileUrl) {
  // LinkedIn does not support pre-filling message text via URL (no public
  // param for it), so this deep-links straight to that profile's message
  // composer; the drafted text is shown alongside it for copy/paste or for
  // a supervised browser-automation step to type in.
  return `${profileUrl.replace(/\/$/, "")}/`;
}

/**
 * Builds (and records) a LinkedIn outreach attempt for one lead.
 * lead.linkedin_url is required - without it this channel is skipped for
 * that lead (same "no excuses, no silent fake data" rule as the other
 * channels).
 */
function prepareLinkedInMessage(lead, message) {
  if (!lead.linkedin_url) {
    throw new Error(`No linkedin_url for lead ${lead.name || lead.phone || lead.email}`);
  }
  const composeUrl = buildComposeLink(lead.linkedin_url);
  const result = {
    mock: false,
    provider: "linkedin-assisted",
    profile_url: lead.linkedin_url,
    compose_url: composeUrl,
    message,
  };
  store.logEvent({
    type: "linkedin_message_prepared",
    lead: lead.linkedin_url,
    message,
  });
  return result;
}

module.exports = { prepareLinkedInMessage };
