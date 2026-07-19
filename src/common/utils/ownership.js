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

module.exports = { canAccessPlayer, canAccessTeam };
