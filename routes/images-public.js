const router = require("express").Router();
const { getBucket } = require("../utils/gridfs");

router.get("/:slug", async (req, res) => {
  try {
    const bucket = getBucket();
    const { slug } = req.params;

    const files = await bucket.find({ filename: slug }).toArray();
    if (!files.length)
      return res.status(404).json({ message: "Image not found" });

    res.set("Content-Type", files[0].contentType || "image/jpeg");
    return bucket.openDownloadStreamByName(slug).pipe(res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal error" });
  }
});

module.exports = router;
