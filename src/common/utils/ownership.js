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

module.exports = { canAccessPlayer };
