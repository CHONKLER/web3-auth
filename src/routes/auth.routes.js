const express = require("express");
const router = express.Router();
const { Connection } = require("@solana/web3.js");
const logger = require("../utils/logger");
const authUtils = require("../utils/auth.utils");

// Initialize Solana connection
const solanaConnection = new Connection("https://api.mainnet-beta.solana.com");

// Error handling middleware
const handleError = (res, error, message = "An error occurred") => {
  logger.error(`${message}:`, error);
  res.status(500).json({
    success: false,
    message,
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
};

// Firebase Anonymous Sign In
router.post("/anonymous", async (req, res) => {
  try {
    const { username } = req.body;

    // Create anonymous user using utility function
    const { uid, token } = await authUtils.createAnonymousUser(username);

    res.status(200).json({
      success: true,
      token,
      uid,
      username: username || null,
    });
  } catch (error) {
    if (error.message && error.message.includes("already taken")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_ALREADY_EXISTS",
      });
    }
    handleError(res, error, "Failed to create anonymous user");
  }
});

// Unified Wallet Authentication
router.post("/wallet/connect", async (req, res) => {
  try {
    const { publicKey, signature, message, username } = req.body;

    if (!publicKey || !signature || !message) {
      return res.status(400).json({
        success: false,
        message: "Public key, signature, and message are required",
      });
    }

    // Verify the signature
    const isValid = await authUtils.verifyWalletSignature(
      message,
      signature,
      publicKey,
      solanaConnection
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    // Unified wallet authentication (login existing or create new)
    const {
      uid,
      token,
      isNewUser,
      username: existingUsername,
    } = await authUtils.unifiedWalletAuth(publicKey, username);

    res.status(200).json({
      success: true,
      token,
      uid,
      isNewUser,
      username: existingUsername || username || null,
      message: isNewUser
        ? "New user created with wallet"
        : "Authenticated with existing wallet",
    });
  } catch (error) {
    if (error.message && error.message.includes("already taken")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_ALREADY_EXISTS",
      });
    }
    handleError(res, error, "Failed to authenticate with wallet");
  }
});

// Link Wallet to Existing User
router.post("/wallet/link", async (req, res) => {
  try {
    const { publicKey, signature, message, uid } = req.body;

    if (!publicKey || !signature || !message || !uid) {
      return res.status(400).json({
        success: false,
        message: "Public key, signature, message, and user ID are required",
      });
    }

    // Verify the signature
    const isValid = await authUtils.verifyWalletSignature(
      message,
      signature,
      publicKey,
      solanaConnection
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    // Link wallet to user
    await authUtils.linkWalletToUser(uid, publicKey);

    res.status(200).json({
      success: true,
      message: "Wallet connected successfully",
      publicKey: publicKey,
    });
  } catch (error) {
    if (error.message === "Wallet already linked to another user") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    handleError(res, error, "Failed to connect wallet");
  }
});

// Update Username
router.post("/username", async (req, res) => {
  try {
    const { uid, username } = req.body;

    if (!uid || !username) {
      return res.status(400).json({
        success: false,
        message: "User ID and username are required",
      });
    }

    // Update username
    await authUtils.updateUsername(uid, username);

    res.status(200).json({
      success: true,
      message: "Username updated successfully",
      username,
    });
  } catch (error) {
    if (error.message && error.message.includes("already taken")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_ALREADY_EXISTS",
      });
    }
    handleError(res, error, "Failed to update username");
  }
});

// Logout endpoint
router.post("/logout", async (req, res) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Update last active timestamp
    await authUtils.updateUserLastActive(uid);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to logout");
  }
});

// Get user profile
router.get("/user/:uid", async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Get user profile
    const user = await authUtils.getUserById(uid);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Remove sensitive information
    const {
      createdAt,
      lastActive,
      walletLinkedAt,
      walletAddress,
      isAnonymous,
      username,
    } = user;

    res.status(200).json({
      success: true,
      user: {
        uid,
        username: username || null,
        isAnonymous,
        hasWallet: !!walletAddress,
        walletAddress: walletAddress || null,
        createdAt: createdAt ? createdAt.toDate() : null,
        lastActive: lastActive ? lastActive.toDate() : null,
        walletLinkedAt: walletLinkedAt ? walletLinkedAt.toDate() : null,
      },
    });
  } catch (error) {
    handleError(res, error, "Failed to get user profile");
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
