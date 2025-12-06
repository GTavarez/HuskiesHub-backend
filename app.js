require("dotenv").config();
const express = require("express");
const { connectDB } = require("./db");

// ROUTES
const authRoutes = require("./routes/auth");
const scheduleRoutes = require("./routes/schedule");
const adminRoutes = require("./routes/admin");
const imagesRoutes = require("./routes/images");
const uploadsRoutes = require("./routes/uploads");

const app = express();
const PORT = process.env.PORT || 8080;

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const ALLOWED_ORIGINS = [
  "http://localhost:5174",
  "http://localhost:5173",
  "https://www.eshuskiesyoffee.com",
  "http://eshuskiesyoffee.com",
  "https://huskieshub-frontend-891073803869.us-central1.run.app",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ---- ROUTES ----
app.use("/api", scheduleRoutes);
app.use("/api", uploadsRoutes);
app.use("/images", imagesRoutes);
app.use("/admin", adminRoutes);
app.use("/", authRoutes);

// ---- EXPORT APP FIRST ----
module.exports = app;

// ---- START SERVER ONLY IF RUN DIRECTLY ----
if (require.main === module) {
  (async () => {
    console.log("⏳ Connecting to MongoDB...");
    await connectDB();
    console.log("🔥 Mongo connected — starting server");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })();
}
