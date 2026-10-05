const { resolveRoom } = require("../common/utils/chatRooms");
const { ChatError, createMessage } = require("../modules/chat/chatService");

// At most this many messages per socket in the window below, so one runaway
// client can't flood a team's chat.
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 1000;

module.exports = (io) => {
  io.on("connection", async (socket) => {
    const { user } = socket.data;
    const auth = socket.handshake.auth || {};
    const params = {
      teamId: auth.teamId,
      conversationId: auth.conversationId,
      eventId: auth.eventId,
    };

    let room;
    try {
      room = await resolveRoom(user, params);
    } catch (err) {
      console.warn("Chat room lookup failed:", err.message);
    }
    if (!room) {
      console.log(`❌ ${user.name} denied access to a chat room`);
      socket.disconnect();
      return;
    }

    // Room membership is based on the room the client asked to join, never the
    // connecting user's own teamId — admin/parent/college_coach accounts aren't
    // tied to a single team. resolveRoom re-validates server-side.
    socket.join(room.socketRoom);
    // eslint-disable-next-line no-param-reassign
    socket.data.visible = true;
    console.log(`🟢 ${user.name} joined ${room.key}`);

    // The page tells us when its tab is hidden, so a message sent while it is
    // in the background still triggers a push.
    socket.on("visibility", (visible) => {
      // eslint-disable-next-line no-param-reassign
      socket.data.visible = Boolean(visible);
    });

    const sentAt = [];

    // payload is { text, replyToId, mentions, urgent }; a bare string (older
    // clients) is treated as just the text. The optional ack reports success or
    // the reason it failed, so the sender is never left wondering.
    socket.on("send-message", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const now = Date.now();
        while (sentAt.length && now - sentAt[0] > RATE_LIMIT_WINDOW_MS) sentAt.shift();
        if (sentAt.length >= RATE_LIMIT_COUNT) {
          throw new ChatError(429, "You're sending messages too fast. Wait a few seconds.");
        }
        sentAt.push(now);

        const body = typeof payload === "string" ? { text: payload } : payload || {};
        // Looked up again each time so a change since joining (removed from a
        // group, or the chat turned announcements-only) takes effect right away.
        const current = await resolveRoom(user, params);
        if (!current) throw new ChatError(403, "You no longer have access to this chat.");

        const message = await createMessage({
          io,
          room: current,
          user,
          text: body.text,
          replyToId: body.replyToId,
          mentionIds: body.mentions,
          urgent: body.urgent,
        });
        reply({ ok: true, message });
      } catch (err) {
        if (!(err instanceof ChatError)) console.error("Send message error:", err);
        reply({ ok: false, error: err instanceof ChatError ? err.message : "Couldn't send that message." });
      }
    });

    socket.on("typing", () => {
      socket.to(room.socketRoom).emit("typing", { userId: String(user._id), name: user.name });
    });

    socket.on("disconnect", () => {
      console.log(`🔴 ${user.name} disconnected`);
    });
  });
};
