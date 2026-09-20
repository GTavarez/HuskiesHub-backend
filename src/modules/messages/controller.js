const mongoose = require("mongoose");
const Message = require("./model");
const ChatDigestState = require("./chatDigestState.model");
const Team = require("../teams/model");
const { canAccessTeam } = require("../../common/utils/ownership");
const { getTransporter } = require("../../common/utils/mailer");
const { findTeamContacts } = require("../../common/utils/teamContacts");

const DIGEST_LOOKBACK_DAYS = 7; // only scan teams with recent chat activity
const DEFAULT_LOOKBACK_HOURS = 24; // window for a user's first-ever digest

/**
 * GET /api/messages/:teamId
 */
const getTeamMessages = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { user } = req;

    // ✅ Validate ObjectId first
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({
        message: "Invalid teamId",
      });
    }

    if (!(await canAccessTeam(user, teamId))) {
      return res.status(403).send({ message: "Access denied" });
    }

    // conversationId: null scopes this to the whole-team room — group chats
    // (conversationId set) have their own feed via /api/conversations/:id/messages.
    const messages = await Message.find({ teamId, conversationId: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(messages.reverse());
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

// Emails one contact a summary of team-chat messages they haven't seen since
// their last digest, then advances their digest state to `now`. Returns true
// if an email was sent.
async function sendDigestToContact(user, team, now) {
  const state = await ChatDigestState.findOne({ userId: user._id, teamId: team._id });
  const since = state?.lastNotifiedAt || new Date(now - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

  // conversationId: null — group-chat messages are scoped to their own
  // members and must never leak into the whole-team digest email.
  const unread = await Message.find({
    teamId: team._id,
    conversationId: null,
    senderId: { $ne: user._id },
    createdAt: { $gt: since },
  }).sort({ createdAt: 1 });

  if (unread.length === 0) {
    await ChatDigestState.updateOne(
      { userId: user._id, teamId: team._id },
      { $set: { lastNotifiedAt: now } },
      { upsert: true }
    );
    return false;
  }

  const preview = unread
    .slice(-5)
    .map((m) => `${m.senderName}: ${[m.text, m.imageId ? "[photo]" : ""].filter(Boolean).join(" ")}`)
    .join("\n");

  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    await transporter.sendMail({
      from: fromEmail,
      to: user.email,
      subject: `${unread.length} new message${unread.length === 1 ? "" : "s"} in ${team.name} team chat`,
      text: [
        `Hi ${user.name},`,
        "",
        `You have ${unread.length} new message${unread.length === 1 ? "" : "s"} in the ${team.name} team chat:`,
        "",
        preview,
        "",
        "Log in to HuskiesHub to read and reply.",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Chat digest email not sent:", err.message);
    return false;
  }

  await ChatDigestState.updateOne(
    { userId: user._id, teamId: team._id },
    { $set: { lastNotifiedAt: now } },
    { upsert: true }
  );
  return true;
}

/**
 * POST /api/messages/run-chat-digest-cron
 * Shared-secret-authenticated (Cloud Scheduler), same pattern as the
 * autopay/reminder crons. Intended to run on a schedule (e.g. a few times a
 * day) rather than per-message, so an active chat produces one summary email
 * instead of one email per message.
 */
const runChatDigestCron = async (req, res) => {
  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const now = new Date();
    const lookbackStart = new Date(now - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const activeTeamIds = await Message.distinct("teamId", { createdAt: { $gt: lookbackStart } });
    const teams = await Team.find({ _id: { $in: activeTeamIds } });

    const resultsByTeam = await Promise.all(
      teams.map(async (team) => {
        const contacts = await findTeamContacts(team._id);
        const results = await Promise.all(
          contacts.map((user) => sendDigestToContact(user, team, now))
        );
        return results.filter(Boolean).length;
      })
    );
    const digestsSent = resultsByTeam.reduce((sum, n) => sum + n, 0);

    return res.json({ teamsChecked: teams.length, digestsSent });
  } catch (err) {
    console.error("Run chat digest cron error:", err);
    return res.status(500).json({ message: "Failed to run chat digest" });
  }
};

module.exports = {
  getTeamMessages,
  runChatDigestCron,
};
