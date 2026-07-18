const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, controller.listEvents);
router.get("/:id", auth, controller.getEvent);
router.post("/", auth, requireRole("admin", "coach"), controller.createEvent);
router.patch("/:id", auth, requireRole("admin", "coach"), controller.updateEvent);
router.delete("/:id", auth, requireRole("admin", "coach"), controller.deleteEvent);
router.post("/:id/rsvp", auth, controller.upsertRsvp);

module.exports = router;
