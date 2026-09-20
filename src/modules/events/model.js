const mongoose = require("mongoose");

const rsvpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["yes", "no", "maybe"], required: true },
    respondedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["practice", "game", "lesson", "meeting"], required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    title: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    location: { type: String, default: "" },
    // Who the team is playing (games only). Optional, and remembered per team
    // so it can be picked from a list on the next game.
    opponent: { type: String, default: "" },
    // Cancelling keeps the event visible (marked, not deleted) so anyone who
    // already saw it on their schedule sees it's off rather than it just
    // disappearing.
    status: { type: String, enum: ["scheduled", "cancelled"], default: "scheduled" },
    cancelledAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Bridges a DB-native event to an existing Google Calendar game; null for practices
    googleEventId: { type: String, default: null },
    rsvps: { type: [rsvpSchema], default: [] },
  },
  { timestamps: true }
);

eventSchema.index({ teamId: 1, startsAt: 1 });

module.exports = mongoose.models.Event || mongoose.model("Event", eventSchema);
