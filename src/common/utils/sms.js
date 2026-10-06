// Text messages through Twilio's REST API (no SDK needed for one endpoint).
// Turned on by setting TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
// TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID). Until then every call
// is a quiet no-op, so the rest of the app never depends on it.

const isSmsConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );

// Turns "(555) 123-4567" or "555.123.4567" into "+15551234567". Returns null
// for anything that isn't a plausible US number.
function toE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Best-effort: returns true if Twilio accepted the message.
async function sendSms(phone, body) {
  if (!isSmsConfigured()) return false;
  const to = toE164(phone);
  if (!to) return false;

  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = process.env;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    form.set("From", process.env.TWILIO_FROM_NUMBER);
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
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

module.exports = { isSmsConfigured, sendSms, toE164 };
