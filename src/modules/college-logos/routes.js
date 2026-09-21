const router = require("express").Router();
const multer = require("multer");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Logo must be a PNG, JPEG or WebP image"));
    }
    return cb(null, true);
  },
});

// A wrong file type is a plain Error from the filter; answer it as the 400 it
// is. Real multer errors (size) go to the global handler.
function acceptLogo(req, res, next) {
  logoUpload.single("logo")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) return next(err);
    return res.status(400).json({ message: err.message });
  });
}

router.get("/", controller.listLogos);
router.get("/:key/image", controller.getLogoImage);
router.post("/", auth, requireRole("admin", "coach", "parent", "player"), acceptLogo, controller.uploadLogo);
router.delete("/:key", auth, requireRole("admin"), controller.deleteLogo);

module.exports = router;
