// listImages.js
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  try {
    console.log("MONGO_URI exists:", !!process.env.MONGO_URI);

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    });

    console.log("✅ Connected to MongoDB");

    const {db} = mongoose.connection;

    // If your bucket is called "images", this is correct:
    const files = await db.collection("images.files").find().toArray();

    console.log("FILES:");
    console.log(files);

    await mongoose.disconnect();
    console.log("✅ Disconnected");
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
