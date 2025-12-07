// routes/players.js
const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const adminUpload = require("../middlewares/adminUpload");

// Disk storage for player images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join("uploads", "players"));
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.toLowerCase().replace(/\s+/g, "-");
    cb(null, `${Date.now()  }-${  safeName}`);
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

    const {filename} = req.file;
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

module.exports = router;
