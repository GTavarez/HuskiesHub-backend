const User = require("../users/model");

// Who may start a private message with whom. Built around the SafeSport rule
// for youth sport: an adult talking one-on-one with a minor must have another
// adult copied. Here that means a message between a coach/admin and a player
// always includes the player's parent(s) as members, who can read everything.
//
//   adult <-> adult (coach, admin, parent)      allowed
//   coach/admin <-> player                      allowed, parents added automatically
//   player <-> player                           not allowed (use the team chat or a group)
//   parent <-> someone else's child             not allowed
//   parent <-> their own child                  not allowed (no need)

const ADULT_ROLES = ["coach", "admin", "parent"];

const isAdult = (user) => ADULT_ROLES.includes(user.role);
const isStaff = (user) => ["coach", "admin"].includes(user.role);

async function guardiansOf(player) {
  if (!player.playerId) return [];
  return User.find({ role: "parent", children: player.playerId })
    .select("name email role isTestAccount")
    .lean();
}

// Returns { ok, reason, guardians } for `requester` messaging `target`.
async function evaluateDirectMessage(requester, target) {
  if (String(requester._id) === String(target._id)) {
    return { ok: false, reason: "You can't message yourself." };
  }

  if (isAdult(requester) && isAdult(target)) {
    return { ok: true, guardians: [] };
  }

  let player = null;
  if (requester.role === "player") player = requester;
  else if (target.role === "player") player = target;
  const other = player === requester ? target : requester;

  if (player && other && isStaff(other)) {
    const guardians = await guardiansOf(player);
    if (guardians.length === 0) {
      return {
        ok: false,
        reason:
          "This player doesn't have a parent account linked yet, so a private message can't be started. Use a group chat, or ask their parent to link their account.",
      };
    }
    return { ok: true, guardians };
  }

  return { ok: false, reason: "Private messages with this person aren't available. Use the team chat or a group." };
}

module.exports = { evaluateDirectMessage, guardiansOf, isAdult, isStaff };
