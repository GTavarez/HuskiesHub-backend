const mongoose = require("mongoose");
const CollegeLogo = require("./model");
const Player = require("../players/model");
const { canAccessPlayerScoped } = require("../../common/utils/ownership");
const { getBucket } = require("../../common/utils/gridfs");

// SVG is deliberately not allowed: it can carry script, and these bytes are
// opened in the browser.
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Must match collegeLogoKey() in the frontend (src/utils/collegeLogo.js).
function collegeKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

// GET /api/college-logos (public): which colleges have a logo.
const listLogos = async (req, res) => {
  try {
    const logos = await CollegeLogo.find().select("key name updatedAt").lean();
    return res.json(
      logos.map((l) => ({ key: l.key, name: l.name, version: new Date(l.updatedAt).getTime() }))
    );
  } catch (err) {
    console.error("List college logos error:", err);
    return res.status(500).json({ message: "Failed to fetch logos" });
  }
};

// GET /api/college-logos/:key/image (public): the logo itself. A school logo
// is not private, and the public College Commitments page shows it.
const getLogoImage = async (req, res) => {
  try {
    const logo = await CollegeLogo.findOne({ key: String(req.params.key).toLowerCase() }).lean();
    if (!logo) return res.status(404).json({ message: "Logo not found" });

    const bucket = getBucket();
    const [file] = await bucket.find({ _id: logo.fileId }).toArray();
    if (!file) return res.status(404).json({ message: "Logo not found" });

    res.set(
      "Content-Type",
      LOGO_TYPES.includes(file.contentType) ? file.contentType : "application/octet-stream"
    );
    res.set("X-Content-Type-Options", "nosniff");
    // The frontend adds ?v=<version>, so a new upload gets a new URL.
    res.set("Cache-Control", "public, max-age=86400");

    const stream = bucket.openDownloadStream(logo.fileId);
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).json({ message: "Failed to load logo" });
    });
    return stream.pipe(res);
  } catch (err) {
    console.error("Get college logo error:", err);
    return res.status(500).json({ message: "Failed to load logo" });
  }
};

// POST /api/college-logos (multipart: logo, college, playerId?)
// Admins and coaches can add or replace any college's logo. A parent or player
// can add one only for the school their own committed player is going to, and
// only if that school has no logo yet, so a family can't overwrite a logo
// that's already up.
const uploadLogo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No logo uploaded" });
  }
  const college = typeof req.body.college === "string" ? req.body.college.trim() : "";
  const key = collegeKey(college);
  if (!college || !key || college.length > 120) {
    return res.status(400).json({ message: "Enter the college name" });
  }

  try {
    const existing = await CollegeLogo.findOne({ key });
    const isStaff = ["admin", "coach"].includes(req.user.role);

    if (!isStaff) {
      const { playerId } = req.body;
      if (!playerId || !mongoose.Types.ObjectId.isValid(playerId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!(await canAccessPlayerScoped(req.user, playerId))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const player = await Player.findById(playerId).select("isCommitted committedCollege").lean();
      if (!player?.isCommitted || collegeKey(player.committedCollege) !== key) {
        return res.status(403).json({ message: "That isn't the college this player committed to." });
      }
      if (existing) {
        return res
          .status(409)
          .json({ message: "This college already has a logo. Ask a coach or admin to change it." });
      }
    }

    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(`college-logo-${key}`, {
      contentType: req.file.mimetype,
      metadata: { owner: req.user._id.toString(), originalName: req.file.originalname, kind: "college-logo" },
    });
    uploadStream.end(req.file.buffer);
    const fileId = await new Promise((resolve, reject) => {
      uploadStream.on("finish", () => resolve(uploadStream.id));
      uploadStream.on("error", reject);
    });

    const saved = await CollegeLogo.findOneAndUpdate(
      { key },
      { key, name: existing?.name || college, fileId, updatedBy: req.user._id },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (existing?.fileId) {
      bucket.delete(existing.fileId).catch(() => {});
    }
    return res.status(existing ? 200 : 201).json({
      key: saved.key,
      name: saved.name,
      version: new Date(saved.updatedAt).getTime(),
    });
  } catch (err) {
    console.error("Upload college logo error:", err);
    return res.status(500).json({ message: "Failed to save logo" });
  }
};

// DELETE /api/college-logos/:key (admin)
const deleteLogo = async (req, res) => {
  try {
    const logo = await CollegeLogo.findOneAndDelete({ key: String(req.params.key).toLowerCase() });
    if (!logo) return res.status(404).json({ message: "Logo not found" });
    getBucket().delete(logo.fileId).catch(() => {});
    return res.status(204).end();
  } catch (err) {
    console.error("Delete college logo error:", err);
    return res.status(500).json({ message: "Failed to delete logo" });
  }
};

module.exports = { listLogos, getLogoImage, uploadLogo, deleteLogo, collegeKey };
