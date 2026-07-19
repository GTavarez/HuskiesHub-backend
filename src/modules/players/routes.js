const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

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
 */
router.post(
  "/admin/players/image",
  auth,
  requireRole("admin", "coach"),
  upload.single("image"),
  controller.uploadPlayerImage
);

router.post("/", auth, requireRole("admin", "coach"), controller.createPlayer);
router.get("/team/:teamId", controller.getTeamPlayers);
router.patch("/:playerId", auth, controller.updatePlayer);

module.exports = router;
