const mongoose = require("mongoose");
const Announcement = require("./model");
const { getTransporter } = require("../../common/utils/mailer");
const { findTeamContacts, findAllContacts } = require("../../common/utils/teamContacts");
const { getBucket } = require("../../common/utils/gridfs");

// Best-effort — an email hiccup should never fail the announcement itself
// (matches the pattern used for every other transactional email in this app).
async function notifyAnnouncementRecipients(announcement) {
  try {
    const contacts = announcement.teamId
      ? await findTeamContacts(announcement.teamId)
      : await findAllContacts();

    const recipients = announcement.audience?.length
      ? contacts.filter((u) => announcement.audience.includes(u.role))
      : contacts;

    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;

    await Promise.all(
      recipients.map((user) =>
        transporter
          .sendMail({
            from: fromEmail,
            to: user.email,
            subject: `New announcement: ${announcement.title}`,
            text: [
              `Hi ${user.name},`,
              "",
              announcement.body,
              "",
              "Log in to HuskiesHub to see this and any other announcements.",
            ].join("\n"),
          })
          .catch((err) => console.warn("Announcement email not sent:", err.message))
      )
    );
  } catch (err) {
    console.warn("Announcement notification skipped:", err.message);
  }
}

const listAnnouncements = async (req, res) => {
  const { teamId } = req.query;

  const filter = {};
  if (teamId) {
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ message: "Invalid teamId" });
    }
    // org-wide (teamId: null) announcements are always included alongside team-specific ones
    filter.$or = [{ teamId }, { teamId: null }];
  }

  try {
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
    return res.json(announcements);
  } catch (err) {
    console.error("List announcements error:", err);
    return res.status(500).json({ message: "Failed to fetch announcements" });
  }
};

const createAnnouncement = async (req, res) => {
  const { teamId, title, body, audience } = req.body;

  if (!title || !body) {
    return res.status(400).json({ message: "title and body are required" });
  }

  // A coach can only post to their own team — never org-wide (teamId: null)
  // and never another team's roster, regardless of what the request sends.
  if (req.user.role === "coach") {
    if (!req.user.teamId) {
      return res.status(403).json({ message: "You're not linked to a team" });
    }
    if (teamId && String(teamId) !== String(req.user.teamId)) {
      return res.status(403).json({ message: "You can only post to your own team" });
    }
  }
  const resolvedTeamId = req.user.role === "coach" ? req.user.teamId : teamId || null;

  // Image attachment is admin-only — coaches post text-only announcements.
  if (req.file && req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can attach an image to an announcement" });
  }

  try {
    let imageUrl = null;
    if (req.file) {
      const bucket = getBucket();
      const uploadStream = bucket.openUploadStream(`announcement-${Date.now()}`, {
        contentType: req.file.mimetype,
        metadata: { originalName: req.file.originalname, kind: "announcement" },
      });
      uploadStream.end(req.file.buffer);
      const fileId = await new Promise((resolve, reject) => {
        uploadStream.on("finish", () => resolve(uploadStream.id));
        uploadStream.on("error", reject);
      });
      imageUrl = `/api/uploads/${fileId.toString()}`;
    }

    const announcement = await Announcement.create({
      teamId: resolvedTeamId,
      title,
      body,
      imageUrl,
      audience: audience || [],
      authorId: req.user._id,
    });
    notifyAnnouncementRecipients(announcement);
    return res.status(201).json(announcement);
  } catch (err) {
    console.error("Create announcement error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid announcement id" });
  }

  try {
    const announcement = await Announcement.findById(id);
    if (!announcement) return res.status(404).json({ message: "Announcement not found" });

    // A coach can only remove their own team's announcements, not an
    // org-wide one or another team's — matches the create-time restriction.
    if (req.user.role === "coach") {
      if (!announcement.teamId || String(announcement.teamId) !== String(req.user.teamId)) {
        return res.status(403).json({ message: "You can only delete your own team's announcements" });
      }
    }

    await Announcement.findByIdAndDelete(id);

    const gridFsPrefix = "/api/uploads/";
    if (announcement.imageUrl?.startsWith(gridFsPrefix)) {
      const imageId = announcement.imageUrl.slice(gridFsPrefix.length);
      if (mongoose.Types.ObjectId.isValid(imageId)) {
        getBucket()
          .delete(new mongoose.Types.ObjectId(imageId))
          .catch((err) => console.warn("Announcement image cleanup warning:", err.message));
      }
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Delete announcement error:", err);
    return res.status(500).json({ message: "Failed to delete announcement" });
  }
};

module.exports = { listAnnouncements, createAnnouncement, deleteAnnouncement };
