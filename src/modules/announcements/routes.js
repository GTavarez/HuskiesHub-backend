const router = require("express").Router();
const multer = require("multer");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

// Memory storage straight into GridFS, images only. A higher cap than the
// avatar upload (5MB) — these are often straight-from-phone flyer/event
// photos, which routinely run 6-10MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    return cb(null, true);
  },
});

router.get("/", auth, controller.listAnnouncements);
router.post(
  "/",
  auth,
  requireRole("admin", "coach"),
  upload.single("image"),
  controller.createAnnouncement
);
router.delete("/:id", auth, requireRole("admin", "coach"), controller.deleteAnnouncement);

module.exports = router;
