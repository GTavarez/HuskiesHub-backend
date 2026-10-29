const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

// Public, no account: families register from the Tryouts page.
router.post("/", controller.createTryout);

// Admin dashboard.
router.get("/", auth, requireRole("admin"), controller.listTryouts);
router.patch("/:id/status", auth, requireRole("admin"), controller.updateTryoutStatus);
router.post("/:id/move-to-team", auth, requireRole("admin"), controller.moveTryoutToTeam);
router.delete("/:id", auth, requireRole("admin"), controller.deleteTryout);

module.exports = router;
