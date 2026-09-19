/**
 * Normalizes a phone number for use as a lookup key.
 *
 * Handles a real gap: a leading "+" in an E.164 number can arrive as a
 * decoded space when it travels through an un-encoded query string or
 * form body (both Express's `qs` query parser and a raw
 * application/x-www-form-urlencoded body decode "+" as a space). Without
 * this, DronaHQ's pre-call webhook (?phone=+91...) or an inbound webhook
 * payload could silently fail to match a stored lead.
 */
function normalizePhone(raw) {
  if (!raw) return raw;
  const original = String(raw);
  // Check the UNTRIMMED original: a leading space immediately followed by
  // a digit is the signature of a "+" that got decoded away. Trimming
  // first would destroy this signal before we can see it.
  const mangledPlus = /^\s+\d/.test(original);
  const trimmed = original.trim();
  const hasPlus = mangledPlus || trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return (hasPlus ? "+" : "") + digits;
}

module.exports = { normalizePhone };
