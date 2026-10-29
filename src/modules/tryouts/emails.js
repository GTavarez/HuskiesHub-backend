// Wording for the two emails a tryout registration sends. Plain text, and free
// of database and email code so it can be tested on its own.

const SCHEDULING_EMAIL = "cesportstraining@gmail.com";
const SCHEDULING_PHONE = "201-741-8563";

const shortDate = (date) =>
  date ? new Date(date).toISOString().slice(0, 10) : "";

// For the coaches: everything they need to call the family back.
function formatTryoutNotice(t) {
  const lines = [
    "A new tryout registration came in.",
    "",
    `Player: ${t.playerName}`,
    `Age group: ${t.ageGroup}`,
    `Position: ${t.position}`,
  ];
  if (t.birthDate) lines.push(`Birth date: ${shortDate(t.birthDate)}`);
  lines.push(`Current team: ${t.currentTeam || "(none given)"}`);
  lines.push("Previous club experience:", t.previousClubExperience || "(none given)");
  lines.push(
    "",
    "Parent or guardian",
    `Name: ${t.parentName}`,
    `Email: ${t.parentEmail}`,
    `Phone: ${t.parentPhone}`,
    "",
    "They were told to email or call to set up a private tryout. Reply to this email to reach the parent.",
    "To move her onto a team after tryouts, use the Tryouts tab in the admin dashboard."
  );
  return {
    subject: `Tryout registration: ${t.playerName} (${t.ageGroup})`,
    text: lines.join("\n"),
  };
}

// For the family: confirms we have it and says how to book the private tryout.
function formatTryoutConfirmation(t) {
  return {
    subject: "We got your Empire State Huskies tryout registration",
    text: [
      `Hi ${t.parentName},`,
      "",
      `Thanks for registering ${t.playerName} for a ${t.ageGroup} tryout with the Empire State Huskies Yoffee. There is no fee.`,
      "",
      "Tryouts are private, so the next step is to pick a time:",
      `- Email ${SCHEDULING_EMAIL}`,
      `- or call Joel Yoffee at ${SCHEDULING_PHONE}`,
      "",
      "Empire State Huskies Yoffee",
    ].join("\n"),
  };
}

module.exports = { formatTryoutNotice, formatTryoutConfirmation, SCHEDULING_EMAIL, SCHEDULING_PHONE };
