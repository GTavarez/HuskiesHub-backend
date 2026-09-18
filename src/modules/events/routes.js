const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, controller.listEvents);
router.get("/:id", auth, controller.getEvent);
// Coaches can add, edit, and cancel anything on their own team's schedule —
// not just events they personally created, so a coach can fix a game an
// admin (or another coach) posted. Hard delete stays admin-only, the one
// irreversible action here.
router.post("/", auth, requireRole("admin", "coach"), controller.createEvent);
router.patch("/:id", auth, requireRole("admin", "coach"), controller.updateEvent);
router.patch("/:id/cancel", auth, requireRole("admin", "coach"), controller.cancelEvent);
router.delete("/:id", auth, requireRole("admin"), controller.deleteEvent);
router.post("/:id/rsvp", auth, controller.upsertRsvp);

module.exports = router;
