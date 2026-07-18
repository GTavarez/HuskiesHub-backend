const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.post("/", auth, controller.signWaiver);
router.get("/", auth, requireRole("admin"), controller.listSignatures);

module.exports = router;
