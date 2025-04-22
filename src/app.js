// Load environment variables if not already loaded
require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
const path = require("path");
const cors = require("cors");
const app = express();

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure CORS to allow specific origins and handle credentials properly
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);

      // List of allowed origins
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://www.chonklertest.fun/",
        "https://www.chonkler.fun/",
      ];

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    credentials: false, // Changed to false since we're not using cookies/sessions
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 3600, // Reduced cache time to 1 hour for development
  })
);

// Initialize Firebase Admin with environment variables
try {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
      process.env.FIREBASE_CLIENT_EMAIL
    )}`,
    universe_domain: "googleapis.com",
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
  });

  console.log("Firebase Admin initialized successfully");
  console.log(`Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
  process.exit(1);
}

// Initialize Firestore
const db = admin.firestore();
db.settings({ timestampsInSnapshots: true });

// Import routes
const authRoutes = require("./routes/auth.routes");

// Use routes
app.use("/api/auth", authRoutes);

// Base route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Web3 Auth API is running correctly",
    version: "1.0.0",
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

module.exports = app;
