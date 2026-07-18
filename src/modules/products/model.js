const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["camp", "lesson", "apparel"], required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    priceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "usd" },
    active: { type: Boolean, default: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

productSchema.index({ active: 1, type: 1 });

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
