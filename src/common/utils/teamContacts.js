const Player = require("../../modules/players/model");
const User = require("../../modules/users/model");

// Resolves everyone who should hear about a team (its own player/coach
// accounts, plus the parent accounts linked to its roster) — shared by event
// reminders, announcements, and the chat digest so "who's on this team" stays
// defined in one place.
async function findTeamContacts(teamId) {
  const players = await Player.find({ teamId, removedFromRoster: { $ne: true } }, "_id");
  const playerIds = players.map((p) => p._id);
  const users = await User.find({
    $or: [{ teamId }, { children: { $in: playerIds } }, { playerId: { $in: playerIds } }],
  });
  return users.filter((u) => u.email);
}

// Org-wide equivalent for a null-teamId ("everyone") announcement.
async function findAllContacts() {
  const users = await User.find({});
  return users.filter((u) => u.email);
}

// Merges the admins who opted into watching every team's schedule emails
// into a team's normal contact list, deduped in case one is already a real
// contact on that team — used only by the schedule notification emails, not
// announcements/chat digests/the Contacts panel.
async function withScheduleWatchers(contacts) {
  const watchers = await User.find({ watchAllScheduleEmails: true, email: { $exists: true, $ne: "" } });
  const seen = new Set(contacts.map((c) => String(c._id)));
  const extra = watchers.filter((w) => !seen.has(String(w._id)));
  return [...contacts, ...extra];
}

module.exports = { findTeamContacts, findAllContacts, withScheduleWatchers };
