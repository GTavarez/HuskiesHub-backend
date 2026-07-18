const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", controller.getTeams);
router.get("/:id", controller.getTeamById);
router.post("/", auth, requireRole("admin"), controller.createTeam);
router.patch("/:id", auth, requireRole("admin"), controller.updateTeam);

module.exports = router;
