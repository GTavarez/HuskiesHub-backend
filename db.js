const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI || process.env.LOCAL_MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await mongoose.connect(uri);
}

module.exports = { connectDB };
