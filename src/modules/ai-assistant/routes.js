const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const controller = require("./controller");

// No requireRole here — the role-filtered tool allowlist inside controller.ask
// is the actual gate (fan/college_coach get zero tools, effectively read-only chat).
router.post("/ask", auth, controller.ask);

module.exports = router;
