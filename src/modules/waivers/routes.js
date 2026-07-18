const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/active", auth, controller.getActiveWaiver);
router.get("/", auth, requireRole("admin"), controller.listWaivers);
router.post("/", auth, requireRole("admin"), controller.createWaiverVersion);

module.exports = router;
