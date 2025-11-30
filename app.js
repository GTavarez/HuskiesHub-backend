// Load env ONLY in development
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
const { connectDB } = require("./db");

const app = express();
const { PORT = 8080 } = process.env;

// ----------------------------------------------------------
//                 CORS CONFIG (SAFE FOR PRODUCTION)
// ----------------------------------------------------------

// ----------------------------------------------------------
//                  FIXED GLOBAL CORS MIDDLEWARE
// ----------------------------------------------------------

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://www.eshuskiesyoffee.com",
  "https://huskieshub-frontend-891073803869-us-central1.run.app",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // ⭐ If request is for IMAGES — special CORS rules (no credentials)
  if (req.path.startsWith("/images")) {
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    // ⭐ DO NOT SEND ALLOW-CREDENTIALS — CORB fix
    return next();
  }

  // ⭐ All other endpoints
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
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

  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

// ----------------------------------------------------------
//                    STATIC FILES
// ----------------------------------------------------------
app.use(
  "/uploads/avatars",
  express.static(path.join(__dirname, "uploads", "avatars"))
);

app.use("/players", express.static(path.join(__dirname, "uploads", "players")));

// ----------------------------------------------------------
//                    BODY PARSERS
// ----------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------------
//                    ROUTES
// ----------------------------------------------------------
function mountRoutes() {
  app.use("/", authRoutes);
  app.use("/api", scheduleRoutes);

  // 🚨 MUST COME BEFORE JSON PARSING OR MULTER BREAKS
  app.use("/admin", adminRoutes);

  // GridFS GET route
  app.use("/images", imagesRoutes);
}

// ----------------------------------------------------------
//                    START SERVER
// ----------------------------------------------------------
async function start() {
  console.log("⏳ Connecting to MongoDB...");
  await connectDB();

  console.log("✅ Mongo connected — mounting routes");
  mountRoutes();

  app.listen(PORT, "0.0.0.0", () =>
    console.log(`🚀 Server running on port ${PORT}`)
  );
}

start();
