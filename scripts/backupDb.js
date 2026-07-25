require("dotenv").config();
const mongoose = require("mongoose");
const { Storage } = require("@google-cloud/storage");
const { connectDB } = require("../db");

const BUCKET_NAME = process.env.BACKUP_BUCKET_NAME || "huskieshub-db-backups";

// Dumps every collection to its own JSON file under a timestamped folder in
// GCS (e.g. backups/2026-07-25T03-00-00/users.json). Plain JSON rather than
// a mongodump archive — no extra binary needed in the container, and any
// collection can be restored independently with a small import script.
async function main() {
  await connectDB();
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET_NAME);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const collections = await mongoose.connection.db.listCollections().toArray();

  console.log(`Backing up ${collections.length} collections to gs://${BUCKET_NAME}/backups/${timestamp}/`);

  for (const { name } of collections) {
    const docs = await mongoose.connection.db.collection(name).find({}).toArray();
    const file = bucket.file(`backups/${timestamp}/${name}.json`);
    await file.save(JSON.stringify(docs, null, 2), { contentType: "application/json" });
    console.log(`  ${name}: ${docs.length} documents`);
  }

  console.log("Backup complete.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
