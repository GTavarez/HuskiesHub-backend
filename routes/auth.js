const router = require("express").Router();
const {
  signup,
  signin,
  getCurrentUser,
  updateUserProfile, uploadAvatar
} = require("../controllers/auth");
const auth = require("../middlewares/auth");

router.post("/signup", signup);
router.post("/signin", signin);
router.get("/me", auth, getCurrentUser);
router.patch("/me", auth, updateUserProfile);
router.patch("/me/avatar", auth, uploadAvatar);

module.exports = router;
