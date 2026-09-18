const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const controller = require("./controller");

router.get("/upcoming", auth, controller.getUpcoming);
// No user auth — called by Cloud Scheduler, authenticated via CRON_SECRET
// header inside the handler itself.
router.post("/run-reminder-cron", controller.runReminderCron);

module.exports = router;
