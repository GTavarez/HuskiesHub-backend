const express = require("express");
const multer = require("multer");
const { getTeamMessages, runChatDigestCron } = require("./controller");
const { sendPhotoMessage, getMessagePhoto, SAFE_IMAGE_TYPES } = require("./photoController");
const auth = require("../../common/middlewares/auth");

const router = express.Router();

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!SAFE_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WebP, GIF or HEIC photos are allowed"));
    }
    return cb(null, true);
  },
});

// The file filter reports a wrong file type as a plain Error, which the global
// handler would turn into a 500. Answer it as the 400 it is; real multer
// errors (size limit) still go to the global handler.
function acceptPhoto(req, res, next) {
  photoUpload.single("photo")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) return next(err);
    return res.status(400).json({ message: err.message });
  });
}

// No user auth — called by Cloud Scheduler, authenticated via CRON_SECRET
// header inside the handler itself.
router.post("/run-chat-digest-cron", runChatDigestCron);

// Photos in team chat and group chats. Mounted before /:teamId so "photo"
// is never mistaken for a team id.
router.post("/photo", auth, acceptPhoto, sendPhotoMessage);
router.get("/photo/:messageId", auth, getMessagePhoto);

// GET chat history for a team
router.get("/:teamId", auth, getTeamMessages);

module.exports = router;
