const router = require("express").Router();
const { sendContactMessage } = require("./controller");

router.post("/", sendContactMessage);

module.exports = router;
