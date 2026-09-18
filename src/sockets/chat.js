const mongoose = require("mongoose");
const Message = require("../modules/messages/model");
const Conversation = require("../modules/conversations/model");
const { canAccessTeam, canAccessConversation } = require("../common/utils/ownership");

module.exports = (io) => {
  io.on("connection", async (socket) => {
    const { user } = socket.data;
    const requestedTeamId = socket.handshake.auth?.teamId;
    const requestedConversationId = socket.handshake.auth?.conversationId;

    // Two mutually exclusive room kinds on one connection: the original
    // whole-team room (teamId), or a coach-created group chat
    // (conversationId) — a client picks exactly one per socket, same as it
    // already did for teamId alone.
    if (requestedConversationId) {
      if (!mongoose.Types.ObjectId.isValid(requestedConversationId)) {
        console.log("❌ Invalid conversationId, disconnecting");
        socket.disconnect();
        return;
      }

      const conversation = await Conversation.findById(requestedConversationId).lean();
      if (!conversation || !canAccessConversation(user, conversation)) {
        console.log(`❌ ${user.name} denied access to conversation ${requestedConversationId}`);
        socket.disconnect();
        return;
      }

      const room = `conversation:${requestedConversationId}`;
      socket.join(room);
      console.log(`🟢 ${user.name} joined conversation ${requestedConversationId}`);

      socket.on("send-message", async (text) => {
        if (!text || !text.trim()) return;

        const message = await Message.create({
          teamId: conversation.teamId,
          conversationId: requestedConversationId,
          senderId: user._id,
          senderName: user.name,
          text,
        });

        io.to(room).emit("new-message", message);
      });

      socket.on("disconnect", () => {
        console.log(`🔴 ${user.name} disconnected`);
      });
      return;
    }

    if (!requestedTeamId) {
      console.log("❌ No teamId or conversationId provided, disconnecting");
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
