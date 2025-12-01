const express = require("express");
const multer = require("multer");
const { getBucket } = require("../db");

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// multer memory upload
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    console.log("📥 Upload incoming…", req.file);

    if (!req.file) {
      return res.status(400).json({ message: "No file received" });
    }

    const slug = req.query.slug;
    if (!slug) {
      return res.status(400).json({ message: "Missing slug" });
    }

    const bucket = getBucket();
    if (!bucket) {
      return res.status(500).json({ message: "Bucket not ready" });
    }

    const uploadStream = bucket.openUploadStream(`${slug}.jpg`, {
      contentType: req.file.mimetype,
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on("finish", () => {
      console.log("✓ Upload complete:", slug);
      res.json({ message: "Uploaded", filename: `${slug}.jpg` });
    });

    uploadStream.on("error", (err) => {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    });

  } catch (err) {
    console.error("❌ Upload handler error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
