const mongoose = require("mongoose");

let bucket = null; // GridFS bucket reference

// Create bucket AS SOON AS mongoose connects
mongoose.connection.on("connected", () => {
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "images",
  });
  console.log("✓ GridFS bucket initialized");
});

async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("❌ MONGO_URI missing");

    console.log("🔍 Attempting to connect to:", uri);
    await mongoose.connect(uri);

    console.log("✅ MongoDB Atlas Connected Successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

function getBucket() {
  return bucket;
}

module.exports = { connectDB, getBucket };
