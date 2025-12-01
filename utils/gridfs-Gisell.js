const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");

let bucket = null;

mongoose.connection.once("open", () => {
  console.log("✅ Mongo connection open – initializing GridFS bucket");
  bucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: "images",
  });
});

function getBucket() {
  if (!bucket) {
    throw new Error("GridFSBucket is not initialized yet");
  }
  return bucket;
}

module.exports = { getBucket };
