const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../utils/config");
const User = require("../models/auth");

async function auth(req, res, next) {
  try {
    const { authorization } = req.headers;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).send({ message: "Authorization required" });
    }
    const token = authorization.replace("Bearer ", "");
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload._id);
    if (!user) {
      return res.status(401).send({ message: "Authorization required" });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).send({ message: "Authorization required" });
  }
}
module.exports = auth;
