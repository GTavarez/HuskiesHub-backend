const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, controller.listRegistrations);
router.get("/:id", auth, controller.getRegistration);
router.post("/", auth, requireRole("admin", "parent"), controller.createRegistration);
router.patch("/:id", auth, requireRole("admin", "parent"), controller.updateRegistration);

module.exports = router;
