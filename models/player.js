const mongoose = require("mongoose");

const highlightSchema = new mongoose.Schema({
  imageUrl: String,
  videoUrl: String,
  createdAt: { type: Date, default: Date.now },
});

const funFactSchema = new mongoose.Schema({
  text: String,
  createdAt: { type: Date, default: Date.now },
});

const playerSchema = new mongoose.Schema({
  name: String,
  jersey: Number,
  position: String,
  gradYear: Number,
  highSchool: String,
  GPA: String,
  image: String,
  isCommitted: Boolean,
  committedCollege: String,
  funFacts: [funFactSchema],
  highlights: [highlightSchema],
});

module.exports = mongoose.model("Player", playerSchema);
