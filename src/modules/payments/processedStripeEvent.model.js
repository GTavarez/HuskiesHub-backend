const mongoose = require("mongoose");

// Webhook-dedupe ledger only — not a domain noun with its own CRUD API,
// so it deliberately has no controller/routes of its own.
const processedStripeEventSchema = new mongoose.Schema({
  stripeEventId: { type: String, required: true, unique: true },
  type: { type: String, default: "" },
  processedAt: { type: Date, default: Date.now },
});

module.exports =
  mongoose.models.ProcessedStripeEvent ||
  mongoose.model("ProcessedStripeEvent", processedStripeEventSchema);
