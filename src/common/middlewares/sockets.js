const jwt = require("jsonwebtoken");
const User = require("../../modules/users/model");

const socketMiddlewares = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("No token"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload._id);

    if (!user) {
      return next(new Error("User not found"));
    }

    // Socket.IO middleware needs the authenticated user attached for room joins.
    // eslint-disable-next-line no-param-reassign
    socket.data.user = user;
    return next();
  } catch (err) {
    return next(new Error("Unauthorized"));
  }
};
module.exports = socketMiddlewares;
