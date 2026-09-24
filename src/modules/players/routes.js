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
router.get("/committed", controller.getCommittedPlayers);
router.get("/:playerId/contact", auth, controller.getPlayerContact);
router.get("/export/contacts", auth, requireRole("admin"), controller.exportContactsCsv);
router.get("/team/:teamId/contacts", auth, controller.getTeamContacts);
router.get("/team/:teamId/showcase-details", auth, controller.getTeamShowcaseDetails);
router.get("/team/:teamId", controller.getTeamPlayers);
router.patch("/:playerId", auth, controller.updatePlayer);
router.delete(
  "/:playerId",
  auth,
  requireRole("admin", "coach"),
  controller.deletePlayer
);

module.exports = router;
