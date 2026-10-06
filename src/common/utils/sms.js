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

module.exports = { isSmsConfigured, sendSms, toRecipient };
