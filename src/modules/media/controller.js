const { ObjectId } = require("mongodb");
const { getBucket } = require("../../common/utils/gridfs");

/**
 * POST /admin?slug=<slug>
 * Legacy admin upload path (used by AdminDashboard.jsx). Filename is always
 * suffixed with .jpg regardless of the source file's real extension — this
 * mirrors the original routes/admin.js behavior exactly, not changed here.
 */
const uploadAdminSlugImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file received" });
    }

    const { slug } = req.query;
    if (!slug) {
      return res.status(400).json({ message: "Missing slug" });
    }

    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(`${slug}.jpg`, {
      contentType: req.file.mimetype,
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on("finish", () => {
      res.json({ message: "Uploaded", filename: `${slug}.jpg` });
    });

    return uploadStream.on("error", (err) => {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    });
  } catch (err) {
    console.error("❌ Upload handler error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /images?slug=<slug>
 * De-dupes any existing file for the same slug before inserting.
 */
const uploadImageBySlug = async (req, res) => {
  try {
    const slug = req.query.slug || req.body.slug;

    if (!slug) {
      return res.status(400).send({ message: "slug is required" });
    }

    if (!req.file) {
      return res.status(400).send({ message: "No file uploaded" });
    }

    const bucket = getBucket();

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

    return uploadStream.on("finish", (file) => {
      if (!file) {
        console.error("❌ GridFS upload finished but 'file' is undefined");
        return res
          .status(500)
          .json({ message: "Upload failed — no file returned" });
      }

      return res.status(201).json({
        message: "Image uploaded",
        slug: file.filename,
        id: file._id,
      });
    });
  } catch (err) {
    console.error("Upload route error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

/**
 * GET /images/:slug
 */
const downloadImageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const bucket = getBucket();

    const files = await bucket.find({ filename: slug }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).send({ message: "Image not found" });
    }

    const file = files[0];
    res.set("Content-Type", file.contentType || "image/jpeg");

    const downloadStream = bucket.openDownloadStreamByName(slug);

    downloadStream.on("error", (err) => {
      console.error("GridFS download error:", err);
      if (!res.headersSent) {
        res.status(500).send({ message: "Error streaming file" });
      }
    });

    return downloadStream.pipe(res);
  } catch (err) {
    console.error("GET /images/:slug error:", err);

    if (!res.headersSent) {
      return res.status(500).send({ message: "Internal server error" });
    }

    return null;
  }
};

/**
 * GET /api/uploads/:id — GridFS by ObjectId, used for avatars.
 */
const downloadById = async (req, res) => {
  try {
    const bucket = getBucket();

    const fileId = new ObjectId(req.params.id);
    const downloadStream = bucket.openDownloadStream(fileId);

    downloadStream.on("error", () =>
      res.status(404).json({ message: "File not found" })
    );

    res.set("Content-Type", "image/jpeg");
    return downloadStream.pipe(res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error retrieving image" });
  }
};

module.exports = {
  uploadAdminSlugImage,
  uploadImageBySlug,
  downloadImageBySlug,
  downloadById,
};
