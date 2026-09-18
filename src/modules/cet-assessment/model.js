const mongoose = require("mongoose");

// One athlete registration per document — deliberately NOT keyed by parent
// email the way Brevo's contact model is. A parent with two athletes
// produces two of these, so neither registration is ever lost/overwritten;
// Brevo only ever sees the parent as a single marketing contact, synced
// separately (see common/utils/brevo.js).
const cetRegistrationSchema = new mongoose.Schema(
  {
    registrationType: { type: String, enum: ["public", "huskies"], required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "CetAssessmentEvent", required: true },
    // Snapshot of the event at registration time so historical records stay
    // accurate even if the "current" event later changes.
    eventName: { type: String, required: true },
    eventDate: { type: Date, required: true },
    eventLocation: { type: String, default: "" },

    parentFirstName: { type: String, required: true },
    parentLastName: { type: String, required: true },
    parentEmail: { type: String, required: true },
    parentPhone: { type: String, default: "" },

    athleteFirstName: { type: String, required: true },
    athleteLastName: { type: String, required: true },
    athleteAge: { type: Number },
    athleteGrade: { type: String, default: "" },
    currentTeamOrg: { type: String, default: "" },
    primaryPosition: { type: String, default: "" },
    isPitcher: { type: Boolean, default: false },

    waiverAgreed: { type: Boolean, required: true },
    marketingConsent: { type: Boolean, default: true },

    leadSource: { type: String, default: "Performance Assessment" },
    paymentStatus: {
      type: String,
      enum: ["free", "pay_later", "pending", "paid"],
      required: true,
    },
    feeCents: { type: Number, default: 0 },
    stripeCheckoutSessionId: { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null },

    brevoSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CetRegistration || mongoose.model("CetRegistration", cetRegistrationSchema);
