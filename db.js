const mongoose = require("mongoose");

let bucket = null;

/* mongoose.connection.on("connected", () => {
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "images",
  });
  console.log("✓ GridFS bucket initialized");
});
 */
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await mongoose.connect(uri);
}

module.exports = { connectDB, bucket };
