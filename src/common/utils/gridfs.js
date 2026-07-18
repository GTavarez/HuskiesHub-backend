const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");

const buckets = new Map();

function getBucket(bucketName = "images") {
  if (!buckets.has(bucketName) && mongoose.connection.readyState === 1) {
    buckets.set(
      bucketName,
      new GridFSBucket(mongoose.connection.db, { bucketName })
    );
  }
  const bucket = buckets.get(bucketName);
  if (!bucket) {
    throw new Error("GridFSBucket is not initialized yet");
  }
  return bucket;
}

module.exports = { getBucket };
