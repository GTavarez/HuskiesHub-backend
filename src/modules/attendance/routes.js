const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, requireRole("admin", "coach"), controller.listAttendance);
router.post("/", auth, requireRole("admin", "coach"), controller.recordAttendance);

module.exports = router;
