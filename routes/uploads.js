const express = require("express");
const { ObjectId } = require("mongodb");
const { getBucket } = require("../db");

const router = express.Router();

router.get("/uploads/:id", async (req, res) => {
  try {
    const bucket = getBucket(); // ⭐ use your initialized bucket

    if (!bucket) {
      console.error("GridFS bucket not ready yet");
      return res.status(503).json({ message: "Bucket not initialized" });
    }

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
});

module.exports = router;
