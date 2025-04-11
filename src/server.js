// Load environment variables first
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const app = require("./app");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 3589;

// Log environment variables for debugging (omitting sensitive ones)
logger.debug(`Environment: ${process.env.NODE_ENV}`);
logger.debug(`Firebase Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
logger.debug(`Port: ${PORT}`);

// Middleware
app.use(helmet());
// Configure CORS to allow requests from all origins
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173", "*"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
