const Message = require("../modules/messages/model");

module.exports = (io) => {
  io.on("connection", (socket) => {
    const { user } = socket.data;

    if (!user.teamId) {
      console.log("❌ User has no team, disconnecting");
      socket.disconnect();
      return;
    }

    const teamRoom = user.teamId.toString();
    socket.join(teamRoom);

    console.log(`🟢 ${user.name} joined team ${teamRoom}`);

    socket.on("send-message", async (text) => {
      if (!text || !text.trim()) return;

      const message = await Message.create({
        teamId: user.teamId,
        senderId: user._id,
        senderName: user.name,
        text,
      });

      io.to(teamRoom).emit("new-message", message);
    });

    socket.on("disconnect", () => {
      console.log(`🔴 ${user.name} disconnected`);
    });
  });
};
