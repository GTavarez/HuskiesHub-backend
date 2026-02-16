const jwt = require("jsonwebtoken");
const Player = require("../models/Player");

module.exports = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const player = await Player.findById(payload._id);

    if (!player) {
      return next(new Error("Player not found"));
    }

    socket.player = player;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
};
