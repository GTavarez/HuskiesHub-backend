const router = require("express").Router();
const multer = require("multer");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/", auth, controller.listDocuments);
router.get("/:id/download", auth, controller.downloadDocument);
router.post(
  "/",
  auth,
  requireRole("admin", "coach"),
  upload.single("file"),
  controller.uploadDocument
);
router.delete("/:id", auth, requireRole("admin", "coach"), controller.deleteDocument);

module.exports = router;
