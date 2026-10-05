const mongoose = require("mongoose");

// The server's VAPID key pair for web push. Generated once, on first use, and
// kept here so every instance and every deploy signs pushes with the same key
// (a changed key would silently invalidate every saved subscription).
const pushConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  publicKey: { type: String, required: true },
  privateKey: { type: String, required: true },
});

module.exports =
  mongoose.models.PushConfig || mongoose.model("PushConfig", pushConfigSchema);
