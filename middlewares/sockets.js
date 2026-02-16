const jwt = require("jsonwebtoken");
const User = require("../models/auth");

socketMiddlewares = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("No token"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload._id);

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.player = user; // ✅ THIS IS THE MISSING LINK
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
};
module.exports = socketMiddlewares;