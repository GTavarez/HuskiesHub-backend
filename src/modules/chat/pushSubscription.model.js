const mongoose = require("mongoose");

// One browser or phone that agreed to receive notifications. A person can have
// several (phone, laptop). The endpoint is unique to that browser.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "", maxlength: 300 },
    failureCount: { type: Number, default: 0 },
    lastSuccessAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.PushSubscription || mongoose.model("PushSubscription", pushSubscriptionSchema);
