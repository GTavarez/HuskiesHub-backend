const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    ageGroup: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, 
  }
);

module.exports = mongoose.models.Team || mongoose.model("Team", teamSchema);
