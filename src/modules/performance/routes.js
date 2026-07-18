const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.post("/entries", auth, requireRole("admin", "coach"), controller.createEntry);
router.get("/entries/:playerId", auth, controller.getEntries);
router.post("/goals", auth, requireRole("admin", "coach"), controller.createGoal);
router.get("/goals/:playerId", auth, controller.getGoals);
router.patch("/goals/:goalId", auth, requireRole("admin", "coach"), controller.updateGoal);

module.exports = router;
