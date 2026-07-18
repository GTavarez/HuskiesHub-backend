const mongoose = require("mongoose");
const Player = require("../players/model");
const Event = require("../events/model");
const Attendance = require("../attendance/model");
const Registration = require("../registrations/model");
const { computeRegistrationBalance } = require("../payments/controller");
const { createNoteRecord } = require("../player-notes/controller");
const { canAccessPlayer } = require("../../common/utils/ownership");
const analyticsService = require("../analytics/service");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// Thrown for any tool-input problem the model should see back as a plain
// message rather than a stack trace — never leaks internal error detail.
class ToolError extends Error {}

// ---- Resolve "my child" / "me" without ever trusting a model-supplied id --
// This is the structural guarantee behind the parent/player tool schemas
// having no playerId field: the target id is always derived here from
// req.user, never accepted as model input.
async function resolveOwnPlayer(user, childName) {
  if (user.role === "player") {
    if (!user.playerId) throw new ToolError("Your account isn't linked to a player profile yet.");
    return user.playerId;
  }

  const childIds = user.children || [];
  if (childIds.length === 0) {
    throw new ToolError("Your account isn't linked to any players yet.");
  }
  if (childIds.length === 1) {
    return childIds[0];
  }

  const children = await Player.find({ _id: { $in: childIds } }, "name");
  if (!childName) {
    throw new ToolError(
      `You have multiple children on file (${children.map((c) => c.name).join(", ")}). Please specify which one.`
    );
  }

  const match = children.find((c) => c.name?.toLowerCase().includes(childName.toLowerCase()));
  if (!match) {
    throw new ToolError(`No child named "${childName}" found on your account.`);
  }
  return match._id;
}

async function countMissedPractices(playerId) {
  const since = new Date(Date.now() - NINETY_DAYS_MS);
  const practiceEvents = await Event.find(
    { type: "practice", startsAt: { $gte: since, $lte: new Date() } },
    "_id"
  );
  const eventIds = practiceEvents.map((event) => event._id);
  if (eventIds.length === 0) return 0;
  return Attendance.countDocuments({
    eventId: { $in: eventIds },
    playerId,
    status: "absent",
  });
}

async function familyBalanceFor(playerId) {
  const registrations = await Registration.find({ playerId });
  const balances = await Promise.all(registrations.map(computeRegistrationBalance));
  const totalBalanceCents = balances.reduce((sum, balance) => sum + balance.balanceCents, 0);
  return { totalBalanceCents, registrations: balances };
}

// ---- Parent / player tools --------------------------------------------

async function getNextPractice(user, { childName } = {}) {
  const playerId = await resolveOwnPlayer(user, childName);
  const player = await Player.findById(playerId);
  if (!player) throw new ToolError("Player not found.");

  const event = await Event.findOne({
    type: "practice",
    teamId: player.teamId,
    startsAt: { $gte: new Date() },
  }).sort({ startsAt: 1 });

  if (!event) return { message: "No upcoming practice scheduled." };
  return {
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
  };
}

async function getMissedPracticesCount(user, { childName, threshold } = {}) {
  const playerId = await resolveOwnPlayer(user, childName);
  const missedPractices = await countMissedPractices(playerId);
  return {
    missedPractices,
    windowDays: 90,
    exceedsThreshold: typeof threshold === "number" ? missedPractices >= threshold : undefined,
  };
}

async function getMyFamilyBalance(user, { childName } = {}) {
  const playerId = await resolveOwnPlayer(user, childName);
  return familyBalanceFor(playerId);
}

// ---- Coach / admin tools — real ids, independently re-checked here -------
// canAccessPlayer's admin/coach branch is coarse (true for ANY player), so
// coach tools re-check team ownership on top of it — a coach's chatbot
// question must never reach across to another team's roster.
async function assertCoachCanAccessPlayer(user, playerId) {
  if (!playerId || !mongoose.Types.ObjectId.isValid(playerId)) {
    throw new ToolError("A valid player id is required.");
  }
  if (!canAccessPlayer(user, playerId)) {
    throw new ToolError("Forbidden.");
  }
  if (user.role === "admin") return;

  const player = await Player.findById(playerId);
  if (!player || !player.teamId || player.teamId.toString() !== user.teamId?.toString()) {
    throw new ToolError("That player is not on your team.");
  }
}

async function getMissedPracticesCountForPlayer(user, { playerId, threshold } = {}) {
  await assertCoachCanAccessPlayer(user, playerId);
  const missedPractices = await countMissedPractices(playerId);
  return {
    missedPractices,
    windowDays: 90,
    exceedsThreshold: typeof threshold === "number" ? missedPractices >= threshold : undefined,
  };
}

async function getTeamAttendanceSummary(user, { teamId } = {}) {
  const targetTeamId = teamId || user.teamId;
  if (!targetTeamId) throw new ToolError("No team specified.");
  if (!mongoose.Types.ObjectId.isValid(targetTeamId)) throw new ToolError("Invalid team id.");
  if (user.role !== "admin" && targetTeamId.toString() !== user.teamId?.toString()) {
    throw new ToolError("You can only view your own team's attendance.");
  }

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const practiceEvents = await Event.find(
    { type: "practice", teamId: targetTeamId, startsAt: { $gte: since } },
    "_id"
  );
  const eventIds = practiceEvents.map((event) => event._id);
  if (eventIds.length === 0) return { attendanceRate: null, windowDays: 30 };

  const grouped = await Attendance.aggregate([
    { $match: { eventId: { $in: eventIds } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const total = grouped.reduce((sum, group) => sum + group.count, 0);
  if (total === 0) return { attendanceRate: null, windowDays: 30 };
  const present = grouped.find((group) => group._id === "present")?.count || 0;
  return { attendanceRate: Math.round((present / total) * 100), windowDays: 30 };
}

// visibleToParent is hardcoded false — never accepted as a model-supplied
// parameter, matching "coach notes saved this way are never visible to parents".
async function saveCoachNote(user, { playerId, type, body } = {}) {
  await assertCoachCanAccessPlayer(user, playerId);
  if (!type || !body) throw new ToolError("type and body are required.");

  const note = await createNoteRecord({
    playerId,
    type,
    body,
    visibleToParent: false,
    authorId: user._id,
  });
  return { saved: true, noteId: note._id };
}

// ---- Admin-only tools ----------------------------------------------------

async function getFamilyBalance(user, { playerId } = {}) {
  if (!playerId || !mongoose.Types.ObjectId.isValid(playerId)) {
    throw new ToolError("A valid player id is required.");
  }
  return familyBalanceFor(playerId);
}

async function getOutstandingBalancesOrgWide() {
  const totalBalanceCents = await analyticsService.getOutstandingBalances();
  return { totalBalanceCents };
}

async function getOrgRevenue(user, { from, to } = {}) {
  const totalRevenueCents = await analyticsService.getOrgRevenue(from, to);
  return { totalRevenueCents };
}

module.exports = {
  getNextPractice,
  getMissedPracticesCount,
  getMyFamilyBalance,
  getMissedPracticesCountForPlayer,
  getTeamAttendanceSummary,
  saveCoachNote,
  getFamilyBalance,
  getOutstandingBalancesOrgWide,
  getOrgRevenue,
  ToolError,
};
