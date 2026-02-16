// routes/players.js
const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const adminUpload = require("../middlewares/adminUpload");
const Player = require("../models/player");
const mongoose = require("mongoose");

// Disk storage for player images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join("uploads", "players"));
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.toLowerCase().replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

/**
 * POST /admin/players/image
 * Headers:
 *   x-admin-secret: <ADMIN_UPLOAD_SECRET>
 * Body:
 *   form-data with field "image"
 */
router.post(
  "/admin/players/image",
  adminUpload,
  upload.single("image"),
  (req, res) => {
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
  }
);
/**
 * POST /api/players
 * Body (JSON):
 * {
 *   name,
 *   jersey,
 *   position,
 *   gradYear,
 *   highSchool,
 *   GPA,
 *   image,
 *   teamId
 * }
 */
router.post("/", async (req, res) => {
  try {
    const player = await Player.create(req.body);
    res.status(201).json(player);
  } catch (err) {
    console.error("Create player error:", err);
    res.status(400).json({ message: err.message });
  }
});
/**
 * GET /api/players/team/:teamId
 */
router.get("/team/:teamId", async (req, res) => {
  const { teamId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({ message: "Invalid teamId" });
  }

  try {
    const players = await Player.find({ teamId }).sort({ jersey: 1 });
    res.json(players);
  } catch (err) {
    console.error("Get players by team error:", err);
    res.status(500).json({ message: "Failed to fetch players" });
  }
});

module.exports = router;
