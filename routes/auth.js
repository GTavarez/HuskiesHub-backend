const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const {
  signup,
  signin,
  getCurrentUser,
  updateUserProfile,
  uploadAvatar,
} = require("../controllers/auth");
const auth = require("../middlewares/auth");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/avatars/"); // folder where files will be saved
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename
  },
});

const upload = multer({ storage });
router.post("/signup", signup);
router.post("/signin", signin);
router.get("/me", auth, getCurrentUser);
router.patch("/me", auth, updateUserProfile);
router.patch("/me/avatar", auth, upload.single("avatar"), uploadAvatar);

module.exports = router;
