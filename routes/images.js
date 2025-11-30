const router = require("express").Router();
const multer = require("multer");
const { getBucket } = require("../utils/gridfs");

const upload = multer({
  storage: multer.memoryStorage(), // file buffer in memory
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

// Simple admin-protection using a secret header
function requireAdmin(req, res, next) {
  const secretFromEnv = process.env.ADMIN_UPLOAD_SECRET;
  const secretFromHeader = req.headers["x-admin-secret"];

  if (!secretFromEnv) {
    console.error("❌ ADMIN_UPLOAD_SECRET not set!");
    return res.status(500).send({ message: "Server misconfigured" });
  }

  if (!secretFromHeader || secretFromHeader !== secretFromEnv) {
    return res.status(403).send({ message: "Forbidden" });
  }

  next();
}
exports.getImage = async (req, res) => {
  try {
    const bucket = getBucket();
    const filename = req.params.filename;

    // Lookup metadata to get contentType
    bucket.find({ filename }).toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      const file = files[0];

      // 👇 VERY IMPORTANT: set MIME type before piping
      res.set("Content-Type", file.contentType || "image/jpeg");

      const readStream = bucket.openDownloadStreamByName(filename);
      readStream.on("error", () =>
        res.status(404).json({ message: "Not found" })
      );
      readStream.pipe(res);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
/**
 * POST /images?slug=as
 * Headers: x-admin-secret: <your secret>
 * Form-data: file: <image file>
 */
router.post("/", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    console.log("🔥 Incoming upload");
    console.log("Headers:", req.headers);
    console.log("Query:", req.query);
    console.log("Body:", req.body);
    console.log("File:", req.file);

    const slug = req.query.slug || req.body.slug;

    if (!slug) {
      return res.status(400).send({ message: "slug is required" });
    }

    if (!req.file) {
      return res.status(400).send({ message: "No file uploaded" });
    }

    const bucket = getBucket();

    // Optional: delete any existing file for same slug
    const existing = await bucket.find({ filename: slug }).toArray();
    if (existing.length > 0) {
      await bucket.delete(existing[0]._id);
    }

    const uploadStream = bucket.openUploadStream(slug, {
      contentType: req.file.mimetype,
      metadata: {
        originalName: req.file.originalname,
      },
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on("error", (err) => {
      console.error("GridFS upload error:", err);
      res.status(500).send({ message: "Error uploading file" });
    });

    uploadStream.on("finish", (file) => {
      if (!file) {
        console.error("❌ GridFS upload finished but 'file' is undefined");
        return res
          .status(500)
          .json({ message: "Upload failed — no file returned" });
      }

      res.status(201).json({
        message: "Image uploaded",
        slug: file.filename,
        id: file._id,
      });
    });
  } catch (err) {
    console.error("Upload route error:", err);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * GET /images/:slug
 * Streams image from GridFS
 */
router.get("/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    const bucket = getBucket();

    const files = await bucket.find({ filename: slug }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).send({ message: "Image not found" });
    }

    const file = files[0];

    if (file.contentType) {
      res.set("Content-Type", file.contentType);
    } else {
      res.set("Content-Type", "image/jpeg");
    }

    const downloadStream = bucket.openDownloadStreamByName(slug);

    downloadStream.on("error", (err) => {
      console.error("GridFS download error:", err);
      if (!res.headersSent) {
        res.status(500).send({ message: "Error streaming file" });
      }
    });

    downloadStream.pipe(res);
  } catch (err) {
    console.error("GET /images/:slug error:", err);
    if (!res.headersSent) {
      res.status(500).send({ message: "Internal server error" });
    }
  }
});

module.exports = router;
