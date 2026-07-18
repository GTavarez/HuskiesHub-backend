const router = require("express").Router();
const multer = require("multer");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Legacy admin upload path (AdminDashboard.jsx) — preserved exactly.
router.post(
  "/admin",
  auth,
  requireRole("admin"),
  memoryUpload.single("file"),
  controller.uploadAdminSlugImage
);

// Slug-based image CRUD (de-dupes on re-upload).
router.post(
  "/images",
  auth,
  requireRole("admin"),
  memoryUpload.single("file"),
  controller.uploadImageBySlug
);
router.get("/images/:slug", controller.downloadImageBySlug);

// GridFS-by-id download, used for avatar URLs.
router.get("/api/uploads/:id", controller.downloadById);

module.exports = router;
