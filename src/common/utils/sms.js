// Text messages through Brevo's transactional SMS API (the same account the
// site's email already uses). Turned on by setting BREVO_API_KEY and
// BREVO_SMS_SENDER (the registered sender name or number). Until then every
// call is a quiet no-op, so the rest of the app never depends on it.

const BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/send";

const isSmsConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER);

// Turns "(555) 123-4567" or "555.123.4567" into "15551234567" (country code,
// no plus), the form Brevo expects. Returns null for anything that isn't a
// plausible US number.
function toRecipient(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return null;
}

// Best-effort: returns true if Brevo accepted the message.
async function sendSms(phone, content) {
  if (!isSmsConfigured()) return false;
  const recipient = toRecipient(phone);
  if (!recipient) return false;

  try {
    const response = await fetch(BREVO_SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: process.env.BREVO_SMS_SENDER,
        recipient,
        content,
        type: "transactional",
      }),
    });
    if (!response.ok) {
      console.warn(`Text message not sent (${response.status}):`, await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Text message error:", err.message);
    return false;
  }
}

const OPT_OUT_NOTE = " Reply HELP for help, STOP to cancel.";

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Texts the parents in `users` who opted in and have a number, once per phone
// number, never test accounts. Keep `message` short: every 160 characters
// costs a credit. Returns how many were accepted.
async function textOptedInParents(users, message) {
  if (!isSmsConfigured()) return 0;
  const seen = new Set();
  const phones = [];
  for (const user of users || []) {
    if (user.role !== "parent" || !user.smsOptIn || user.isTestAccount) continue;
    const recipient = toRecipient(user.phone);
    if (!recipient || seen.has(recipient)) continue;
    seen.add(recipient);
    phones.push(user.phone);
  }
  const body = `${clip(message, 160 - OPT_OUT_NOTE.length)}${OPT_OUT_NOTE}`;
  const results = await Promise.all(phones.map((phone) => sendSms(phone, body)));
  return results.filter(Boolean).length;
}

module.exports = { isSmsConfigured, sendSms, toRecipient, textOptedInParents, clip };
