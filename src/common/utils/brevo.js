// Thin wrapper around Brevo's Contacts REST API — no SDK needed for one
// endpoint. Requires these custom contact attributes to already exist in
// the Brevo account (Contacts → Settings → Contact Attributes) before
// they'll actually stick — Brevo silently drops attributes it doesn't
// recognize rather than erroring:
//   ATHLETE_FIRST, ATHLETE_LAST, ATHLETE_GRADE, ATHLETE_AGE (text/number),
//   TEAM, POSITION (text), PITCHER (text: "Yes"/"No"),
//   SOURCE, REG_TYPE, EVENT, PAYMENT_STATUS (text),
//   ASSESSMENT_REGISTERED (text: "Yes"), ACADEMY_STATUS, REMOTE_STATUS (text)
// FIRSTNAME/LASTNAME/SMS are Brevo's own built-in attributes, no setup needed.
const BREVO_API_BASE = "https://api.brevo.com/v3";

// Best-effort by design, matching every other outbound-email/marketing call
// in this app — a Brevo hiccup should never block a registration from
// completing. Returns true/false so callers can record whether the sync
// actually happened (see brevoSyncedAt on CetRegistration).
async function upsertBrevoContact({ email, attributes, listIds }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("Brevo sync skipped: BREVO_API_KEY is not configured");
    return false;
  }

  try {
    const response = await fetch(`${BREVO_API_BASE}/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds: listIds || [],
        updateEnabled: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`Brevo contact sync failed (${response.status}):`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Brevo contact sync error:", err.message);
    return false;
  }
}

module.exports = { upsertBrevoContact };
