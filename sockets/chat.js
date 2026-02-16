const Message = require("../models/Message");

module.exports = (io) => {
  io.on("connection", (socket) => {
    const player = socket.player;

    if (!player.teamId) {
      console.log("❌ Player has no team, disconnecting");
      return socket.disconnect();
    }

    const teamRoom = player.teamId.toString();
    socket.join(teamRoom);

    console.log(`🟢 ${player.name} joined team ${teamRoom}`);

    socket.on("send-message", async (text) => {
      if (!text || !text.trim()) return;

      const message = await Message.create({
        teamId: player.teamId,
        senderId: player._id,
        senderName: player.name,
        text,
      });

      io.to(teamRoom).emit("new-message", message);
    });

    socket.on("disconnect", () => {
      console.log(`🔴 ${player.name} disconnected`);
    });
  });
};
