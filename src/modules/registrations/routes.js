const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

// Coaches don't get financial visibility at all — registrations and payments
// stay admin/family-only, unlike the coarser team-based access coaches get
// elsewhere (rosters, notes, performance, waivers).
router.get("/", auth, requireRole("admin", "parent", "player"), controller.listRegistrations);
router.get("/:id", auth, requireRole("admin", "parent", "player"), controller.getRegistration);
router.post("/", auth, requireRole("admin", "parent"), controller.createRegistration);
router.patch("/:id", auth, requireRole("admin", "parent"), controller.updateRegistration);

module.exports = router;
