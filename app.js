if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const path = require("path");


const authRoutes = require("./routes/auth");
const scheduleRoutes = require("./routes/schedule");
const adminRoutes = require("./routes/admin");
const imagesRoutes = require("./routes/images");
const { connectDB, getBucket } = require("./db");

const app = express();
const { PORT = 8080 } = process.env;

// ----------- CORS -------------
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const ALLOWED = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://www.eshuskiesyoffee.com",
    "https://huskieshub-frontend-891073803869-us-central1.run.app",
  ];

  if (origin && ALLOWED.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-admin-secret"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// ----------- STATIC FILES -------------
app.use(
  "/uploads/avatars",
  express.static(path.join(__dirname, "uploads", "avatars"))
);
app.use("/players", express.static(path.join(__dirname, "uploads", "players")));

// ----------- ROUTING ORDER -------------
function mountRoutes() {
  app.use("/", authRoutes);
  app.use("/api", scheduleRoutes);

  // 🚨 THIS MUST COME BEFORE JSON PARSERS
  app.use("/admin", adminRoutes);

  // GridFS GET
  app.use("/images", imagesRoutes);
}

// ----------------------------------------------------------
async function start() {
  console.log("⏳ Connecting to MongoDB...");
  await connectDB(); // bucket initialized here

  console.log("✅ Mongo connected — mounting routes");
  mountRoutes();

  app.listen(PORT, "0.0.0.0", () =>
    console.log(`🚀 Server running on port ${PORT}`)
  );
}

start();
