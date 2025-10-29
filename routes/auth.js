const router = require("express").Router();
const { signup, signin, getCurrentUser } = require("../controllers/auth");
const auth = require("../middlewares/auth");

router.post("/signup", signup);
router.post("/signin", signin);
router.get("/me", auth, getCurrentUser);

module.exports = router;
