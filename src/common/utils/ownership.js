const Player = require("../../modules/players/model");

// Verifies a user is allowed to access data scoped to a given playerId.
// Admin/coach keep the coarser team-based access already used elsewhere in
// the app; parent/player roles must be scoped to their own linked player(s) —
// money/PII endpoints must not trust a client-supplied playerId alone.
function canAccessPlayer(user, playerId) {
  if (!user || !playerId) return false;
  if (["admin", "coach"].includes(user.role)) return true;

  const targetId = playerId.toString();

  if (user.role === "parent") {
    return (user.children || []).some((childId) => childId.toString() === targetId);
  }

  if (user.role === "player") {
    return user.playerId && user.playerId.toString() === targetId;
  }

  return false;
}

// canAccessPlayer above lets ANY coach through for ANY player, on purpose
// only where the caller has already scoped by team some other way. Anywhere a
// coach reads or writes an individual player's data, use this instead: it
// keeps every other role's rules unchanged but limits a coach to players on
// their own team. Async because it needs the player's teamId. It is a
// separate function (not a change to canAccessPlayer) so a forgotten `await`
// on the old sync one can't silently turn into a truthy Promise.
async function canAccessPlayerScoped(user, playerId) {
  if (!canAccessPlayer(user, playerId)) return false;
  if (user.role !== "coach") return true;
  if (!user.teamId) return false;

  const player = await Player.findById(playerId).select("teamId");
  return Boolean(player && player.teamId && player.teamId.toString() === user.teamId.toString());
}

// Verifies a user is allowed to access a given team's chat. Unlike
// canAccessPlayer, the parent branch can't be a pure ID comparison — a
// parent's own User doc only holds their children's Player ids, not those
// players' teamIds — so this one needs an actual DB lookup and is async.
async function canAccessTeam(user, teamId) {
  if (!user || !teamId) return false;
  if (user.role === "admin") return true;

  const targetId = teamId.toString();

  if (["coach", "player"].includes(user.role)) {
    return Boolean(user.teamId && user.teamId.toString() === targetId);
  }

  if (user.role === "parent") {
    if (!user.children || user.children.length === 0) return false;
    const match = await Player.findOne({ _id: { $in: user.children }, teamId });
    return Boolean(match);
  }

  return false;
}

// Verifies a user is allowed to read/post in a given conversation (a
// coach-created group chat). Membership is the whole check — unlike
// canAccessTeam, admins do NOT get a blanket pass here, since a group chat is
// deliberately scoped to whoever the coach picked, not "everyone who can see
// this team."
function canAccessConversation(user, conversation) {
  if (!user || !conversation) return false;
  return (conversation.memberIds || []).some(
    (id) => id.toString() === user._id.toString()
  );
}

module.exports = { canAccessPlayer, canAccessPlayerScoped, canAccessTeam, canAccessConversation };
