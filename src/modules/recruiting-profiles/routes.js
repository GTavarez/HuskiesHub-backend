const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireApprovedCollegeCoach = require("../../common/middlewares/requireApprovedCollegeCoach");
const controller = require("./controller");

// Mounted before /:playerId — Express would otherwise treat "search" as a
// :playerId value.
router.get("/search", auth, requireApprovedCollegeCoach, controller.searchProfiles);
router.get("/:playerId", auth, controller.getProfileForPlayer);
router.put("/:playerId", auth, controller.upsertProfile);

module.exports = router;
