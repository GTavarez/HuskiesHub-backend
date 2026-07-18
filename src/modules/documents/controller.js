const mongoose = require("mongoose");
const { getBucket } = require("../../common/utils/gridfs");
const Document = require("./model");

const DOCUMENTS_BUCKET = "documents";

const listDocuments = async (req, res) => {
  const { teamId } = req.query;

  const filter = {};
  if (teamId) {
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ message: "Invalid teamId" });
    }
    filter.teamId = teamId;
  }

  try {
    const documents = await Document.find(filter).sort({ createdAt: -1 });
    return res.json(documents);
  } catch (err) {
    console.error("List documents error:", err);
    return res.status(500).json({ message: "Failed to fetch documents" });
  }
};

const uploadDocument = async (req, res) => {
  const { title, visibility, teamId } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: "No file received" });
  }
  if (!title) {
    return res.status(400).json({ message: "title is required" });
  }

  try {
    const bucket = getBucket(DOCUMENTS_BUCKET);
    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
    });
    uploadStream.end(req.file.buffer);

    const fileId = await new Promise((resolve, reject) => {
      uploadStream.on("finish", () => resolve(uploadStream.id));
      uploadStream.on("error", reject);
    });

    const document = await Document.create({
      title,
      fileRef: fileId,
      uploadedBy: req.user._id,
      visibility: visibility || "team",
      teamId: teamId || null,
    });

    return res.status(201).json(document);
  } catch (err) {
    console.error("Upload document error:", err);
    return res.status(500).json({ message: "Failed to upload document" });
  }
};

const downloadDocument = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid document id" });
  }

  try {
    const document = await Document.findById(id);
    if (!document) return res.status(404).json({ message: "Document not found" });

    const bucket = getBucket(DOCUMENTS_BUCKET);
    const downloadStream = bucket.openDownloadStream(document.fileRef);
    downloadStream.on("error", () => res.status(404).json({ message: "File not found" }));
    return downloadStream.pipe(res);
  } catch (err) {
    console.error("Download document error:", err);
    return res.status(500).json({ message: "Failed to download document" });
  }
};

const deleteDocument = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid document id" });
  }

  try {
    const document = await Document.findByIdAndDelete(id);
    if (!document) return res.status(404).json({ message: "Document not found" });

    try {
      await getBucket(DOCUMENTS_BUCKET).delete(document.fileRef);
    } catch (cleanupErr) {
      console.warn("Document file cleanup warning:", cleanupErr.message);
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Delete document error:", err);
    return res.status(500).json({ message: "Failed to delete document" });
  }
};

module.exports = {
  listDocuments,
  uploadDocument,
  downloadDocument,
  deleteDocument,
};
