const mongoose = require("mongoose");

// A performance-assessment day (Sept 4, a future October date, winter
// testing, etc.) as data instead of hardcoded into the registration forms —
// creating a new one is how the next assessment day gets set up, no
// redeploy needed. Only one should be `active` at a time; the registration
// forms always register against whichever one is currently active.
const assessmentEventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    date: { type: Date, required: true },
    location: { type: String, default: "" },
    publicFeeCents: { type: Number, default: 2000 }, // $20 default per the funnel doc
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CetAssessmentEvent ||
  mongoose.model("CetAssessmentEvent", assessmentEventSchema);
