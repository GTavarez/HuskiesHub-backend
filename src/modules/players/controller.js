const mongoose = require("mongoose");
const Player = require("./model");

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

module.exports = { createPlayer, getTeamPlayers, uploadPlayerImage };
