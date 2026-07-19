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
    const players = await Player.find({ teamId }).sort({ jersey: 1 });
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

module.exports = {
  createPlayer,
  getTeamPlayers,
  uploadPlayerImage,
  updatePlayer,
};
