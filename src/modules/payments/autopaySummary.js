// Plain-text summary of one autopay run, for the admins. Kept free of database
// and email code so it can be tested on its own.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dollars = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

// "2026-10" -> "October 2026"
function periodLabel(billingPeriod) {
  const [year, month] = String(billingPeriod || "").split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : String(billingPeriod || "");
}

// paid:   [{ player, team, amountCents }]
// failed: [{ player, team, amountCents, contactName, contactEmail, reason }]
function formatAutopaySummary({ billingPeriod, paid = [], failed = [], baseUrl = "" }) {
  const paidTotal = paid.reduce((sum, p) => sum + (p.amountCents || 0), 0);
  const label = periodLabel(billingPeriod);

  const subject = failed.length
    ? `Autopay ${label}: ${paid.length} paid, ${failed.length} DECLINED (${dollars(paidTotal)} collected)`
    : `Autopay ${label}: all ${paid.length} paid (${dollars(paidTotal)})`;

  const lines = [`Autopay results for ${label}.`, ""];
  lines.push(`Paid: ${paid.length} (${dollars(paidTotal)})`);
  lines.push(`Declined or failed: ${failed.length}`);
  lines.push("");

  if (failed.length) {
    lines.push("NEEDS A REMINDER");
    for (const f of failed) {
      lines.push(
        `- ${f.player} (${f.team}): ${dollars(f.amountCents)}`,
        `  Contact: ${f.contactName || "unknown"}${f.contactEmail ? ` <${f.contactEmail}>` : ""}`,
        `  Why: ${f.reason || "unknown"}`
      );
    }
    lines.push(
      "",
      "The family was also sent an automatic email asking them to update their card.",
      "Once they have, open Registrations & Payments, View payments on the player, and use Retry charge.",
      ""
    );
  }

  if (paid.length) {
    lines.push("PAID, NOTHING TO DO");
    lines.push(paid.map((p) => `${p.player} (${p.team})`).join(", "));
    lines.push("");
  }

  if (baseUrl) lines.push(`Open the dashboard: ${baseUrl}/admin`);

  const pushBody = failed.length
    ? `${paid.length} paid, ${failed.length} declined: ${failed.map((f) => f.player).slice(0, 4).join(", ")}`
    : `All ${paid.length} paid (${dollars(paidTotal)})`;

  return { subject, text: lines.join("\n"), pushBody };
}

module.exports = { formatAutopaySummary, periodLabel, dollars };
