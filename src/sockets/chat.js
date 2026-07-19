const Message = require("../modules/messages/model");
const { canAccessTeam } = require("../common/utils/ownership");

module.exports = (io) => {
  io.on("connection", async (socket) => {
    const { user } = socket.data;
    const requestedTeamId = socket.handshake.auth?.teamId;

    if (!requestedTeamId) {
      console.log("❌ No teamId provided, disconnecting");
      socket.disconnect();
      return;
    }

    // Room membership is based on the team the client asked to join, never
    // the connecting user's own teamId — admin/parent/college_coach accounts
    // aren't tied to a single team, so trusting only user.teamId here would
    // lock them out of chat entirely. canAccessTeam re-validates server-side.
    if (!(await canAccessTeam(user, requestedTeamId))) {
      console.log(`❌ ${user.name} denied access to team ${requestedTeamId}`);
      socket.disconnect();
      return;
    }

    const teamRoom = requestedTeamId.toString();
    socket.join(teamRoom);

    console.log(`🟢 ${user.name} joined team ${teamRoom}`);

    socket.on("send-message", async (text) => {
      if (!text || !text.trim()) return;

      const message = await Message.create({
        teamId: requestedTeamId,
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
