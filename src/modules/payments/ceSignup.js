// Plain-text notice for one Competitive Edge winter training signup that came in
// through a Stripe Payment Link. Kept free of database and email code so it can
// be tested on its own.

// Matches the `kind` set in the Payment Link's metadata.
const PROGRAMS = {
  trial: "$15 Trial: Performance Assessment + Trial Session",
  "catching-clinic": "$25 Kickoff Catching Clinic",
  bundle: "Full Bundle ($220/month)",
  hitting: "Hitting Development ($160/month)",
  throwing: "Throwing and Arm Care ($160/month)",
  speed: "Speed and COD ($100/month)",
  "catch-member": "Catching, member rate ($60/month)",
  "catch-pack": "Catching 4-Session Pack ($100 one time)",
};

// Dropdown values on the trial link.
const TRIAL_SESSIONS = {
  mon112: "Mon 11/2, 5:30 to 7:30 PM",
  wed114: "Wed 11/4, 5:30 to 7:30 PM",
};

const dollars = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

function fieldValue(session, key) {
  const field = (session.custom_fields || []).find((f) => f.key === key);
  if (!field) return "";
  return String(field.text?.value || field.dropdown?.value || field.numeric?.value || "").trim();
}

function formatCeSignup(session, quantity = 1) {
  const kind = session.metadata?.kind;
  const program = PROGRAMS[kind] || "Winter Training (unrecognized link)";
  const athlete = fieldValue(session, "athletename") || "(not provided)";
  const ageOrTeam = fieldValue(session, "ageorteam") || "(not provided)";
  const sessionPick = fieldValue(session, "session");
  const discount = session.total_details?.amount_discount || 0;
  const details = session.customer_details || {};

  const lines = [
    "A new Winter Training signup just came in.",
    "",
    `Program: ${program}`,
    `Athlete: ${athlete}`,
    `Age or team: ${ageOrTeam}`,
  ];
  if (sessionPick) lines.push(`Session: ${TRIAL_SESSIONS[sessionPick] || sessionPick}`);
  if (quantity > 1) {
    lines.push(`Athletes on this payment: ${quantity} (the other names are not collected, ask the parent)`);
  }
  lines.push(
    `Paid today: ${dollars(session.amount_total)}${discount ? ` (promo code took off ${dollars(discount)})` : ""}`
  );
  if (session.mode === "subscription") lines.push("Billing: monthly, charged automatically from today");
  lines.push(
    "",
    "Parent or payer",
    `Name: ${details.name || "(not provided)"}`,
    `Email: ${details.email || "(not provided)"}`,
    `Phone: ${details.phone || "(not provided)"}`,
    "",
    `Stripe session: ${session.id}`
  );

  const subject = `New winter signup: ${PROGRAMS[kind] ? program.split(" (")[0] : "Winter Training"}, ${athlete}`;
  return { subject, text: lines.join("\n") };
}

module.exports = { formatCeSignup, PROGRAMS };
