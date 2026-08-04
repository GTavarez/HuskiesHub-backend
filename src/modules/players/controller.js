const mongoose = require("mongoose");
const Player = require("./model");
const { canAccessPlayer } = require("../../common/utils/ownership");

// teamId and role are deliberately excluded — team assignment stays an
// admin/coach decision, and role is an internal chat/permissions field, not
// part of a player's public profile.
const EDITABLE_FIELDS = [
  "name",
  "jersey",
  "position",
  "gradYear",
  "highSchool",
  "state",
  "GPA",
  "isCommitted",
  "committedCollege",
  "battingThrowing",
  "contactEmail",
];

/**
 * POST /api/players
 * Body (JSON): { name, jersey, position, gradYear, highSchool, GPA, image, teamId }
 */
const createPlayer = async (req, res) => {
  try {
    const player = await Player.create(req.body);
    return res.status(201).json(player);
  } catch (err) {
    console.error("Create player error:", err);
    return res.status(400).json({ message: err.message });
  }
};

/**
 * GET /api/players/team/:teamId
 */
const getTeamPlayers = async (req, res) => {
  const { teamId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({ message: "Invalid teamId" });
  }

  try {
    const players = await Player.find({
      teamId,
      removedFromRoster: { $ne: true },
    }).sort({ jersey: 1 });
    return res.json(players);
  } catch (err) {
    console.error("Get players by team error:", err);
    return res.status(500).json({ message: "Failed to fetch players" });
  }
};

/**
 * POST /api/players/admin/players/image
 */
const uploadPlayerImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const { filename } = req.file;
  const relativeUrl = `/players/${filename}`;
  const fullUrl = `${req.protocol}://${req.get("host")}${relativeUrl}`;

  return res.status(201).json({
    message: "Player image uploaded successfully",
    filename,
    url: relativeUrl,
    fullUrl,
  });
};

/**
 * PATCH /api/players/:playerId
 * Ownership-gated: admin/coach, the player's linked parent, or the player
 * themself (via canAccessPlayer). Only whitelisted profile fields are
 * writable — team assignment and the internal chat role are not.
 */
const updatePlayer = async (req, res) => {
  const { playerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }

  if (!canAccessPlayer(req.user, playerId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  try {
    const player = await Player.findByIdAndUpdate(playerId, updates, {
      new: true,
      runValidators: true,
    });
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }
    return res.json(player);
  } catch (err) {
    console.error("Update player error:", err);
    return res.status(400).json({ message: err.message });
  }
};

/**
 * DELETE /api/players/:playerId
 * Admin (any player) or coach (their own team's players only) — deliberately
 * NOT reachable via canAccessPlayer's parent/player branches, since removing
 * a roster entry is a roster-management action, not a profile edit a family
 * should be able to trigger themselves. This is a SOFT delete: it flips
 * removedFromRoster so the player drops out of team rosters/PDFs, but the
 * Player document (and anything referencing its id — registrations, chat
 * history) stays in the database.
 */
const deletePlayer = async (req, res) => {
  const { playerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }
  if (!["admin", "coach"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }
    if (
      req.user.role === "coach" &&
      (!player.teamId || player.teamId.toString() !== req.user.teamId?.toString())
    ) {
      return res.status(403).json({ message: "That player is not on your team" });
    }

    player.removedFromRoster = true;
    await player.save();
    return res.json({ removed: true });
  } catch (err) {
    console.error("Delete player error:", err);
    return res.status(500).json({ message: "Failed to delete player" });
  }
};

module.exports = {
  createPlayer,
  getTeamPlayers,
  uploadPlayerImage,
  updatePlayer,
  deletePlayer,
};
