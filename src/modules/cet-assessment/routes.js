const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/current-event", controller.getCurrentEvent);
router.post("/events", auth, requireRole("admin"), controller.createEvent);

router.post("/register", controller.register);
router.post("/:id/checkout", controller.createCheckout);
router.get("/registrations", auth, requireRole("admin"), controller.listRegistrations);
router.get("/:id", controller.getRegistration);

module.exports = router;
