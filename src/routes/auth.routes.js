const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const authUtils = require("../utils/auth.utils");

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

// Unified Wallet Authentication - updated to use wallet address directly
router.post("/wallet/connect", async (req, res) => {
  try {
    const { walletAddress, username } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Wallet address is required",
      });
    }

    // No need to verify signature, just use the wallet address directly
    const {
      uid,
      token,
      isNewUser,
      username: existingUsername,
    } = await authUtils.unifiedWalletAuth(walletAddress, username);

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

// Link Wallet to Existing User - updated to use wallet address directly
router.post("/wallet/link", async (req, res) => {
  try {
    const { walletAddress, uid } = req.body;

    if (!walletAddress || !uid) {
      return res.status(400).json({
        success: false,
        message: "Wallet address and user ID are required",
      });
    }

    // Link wallet to user directly without signature verification
    await authUtils.linkWalletToUser(uid, walletAddress);

    res.status(200).json({
      success: true,
      message: "Wallet connected successfully",
      walletAddress: walletAddress,
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

// Check username availability
router.get("/username/available/:username", async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    // Check if username exists
    const exists = await authUtils.isUsernameExists(username);

    res.status(200).json({
      success: true,
      available: !exists,
    });
  } catch (error) {
    handleError(res, error, "Failed to check username availability");
  }
});

// Add endpoint to check wallet availability
router.get("/wallet/available/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Wallet address is required",
      });
    }

    // Check if wallet address exists
    const exists = await authUtils.isWalletExists(walletAddress);

    res.status(200).json({
      success: true,
      available: !exists,
    });
  } catch (error) {
    handleError(res, error, "Failed to check wallet availability");
  }
});

module.exports = router;
