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

// Unified Authentication (Handles both wallet and anonymous authentication)
router.post("/authenticate", async (req, res) => {
  try {
    const { walletAddress, username } = req.body;

    // Log the authentication request for debugging
    logger.info(
      `Authentication request: username=${username || "none"}, walletAddress=${
        walletAddress
          ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
          : "none"
      }`
    );

    // If wallet provided, check for username mismatch first
    if (walletAddress && username) {
      const existingUser = await authUtils.getUserByWallet(walletAddress);
      if (existingUser && existingUser.username !== username) {
        logger.info(
          `User attempted to use wallet ${walletAddress} with username '${username}' but it's already linked to '${existingUser.username}'`
        );

        return res.status(400).json({
          success: false,
          message: `This wallet address is already linked to username '${
            existingUser.username || "none"
          }'. Please use the correct username or create a new account.`,
          error: "WALLET_LINKED_TO_DIFFERENT_USERNAME",
          existingUsername: existingUser.username || null,
        });
      }
    }

    // Use unified authentication function with optional wallet address
    const {
      uid,
      token,
      isNewUser,
      username: existingUsername,
      authType,
    } = await authUtils.unifiedWalletAuth(walletAddress, username);

    // Create appropriate success message based on auth type and whether it's a new user
    let successMessage;
    if (isNewUser) {
      successMessage =
        authType === "wallet"
          ? "New user created with wallet"
          : "New anonymous user created";
    } else {
      successMessage =
        authType === "wallet"
          ? "Authenticated with existing wallet"
          : "Logged in with existing username";
    }

    res.status(200).json({
      success: true,
      token,
      uid,
      isNewUser,
      username: existingUsername || username || null,
      authType,
      message: successMessage,
    });
  } catch (error) {
    if (
      error.message &&
      error.message.includes("already linked to a different wallet")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_HAS_DIFFERENT_WALLET",
      });
    } else if (error.message && error.message.includes("already taken")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_ALREADY_EXISTS",
      });
    } else if (
      error.message &&
      (error.message.includes("Properties argument must be") ||
        error.message.includes("Invalid data format for user creation"))
    ) {
      // Handle Firebase-specific error for invalid document updates
      logger.error("Invalid data format error:", error);
      return res.status(400).json({
        success: false,
        message:
          "Invalid data provided for authentication. Please check your username and wallet address format.",
        error: "INVALID_DATA_FORMAT",
      });
    } else if (error.message && error.message.includes("Invalid user ID")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "INVALID_USER_ID",
      });
    }
    handleError(res, error, "Failed to authenticate user");
  }
});

// Link or Update Wallet to Existing User
router.post("/wallet/link", async (req, res) => {
  try {
    const { walletAddress, uid, currentWalletAddress } = req.body;

    if (!walletAddress || !uid) {
      return res.status(400).json({
        success: false,
        message: "Wallet address and user ID are required",
      });
    }

    // Check if the new wallet address is already linked to another user
    const existingUserWithWallet = await authUtils.getUserByWallet(
      walletAddress
    );
    if (existingUserWithWallet && existingUserWithWallet.uid !== uid) {
      return res.status(400).json({
        success: false,
        message: "This wallet address is already linked to another account",
        error: "WALLET_ALREADY_LINKED",
      });
    }

    // Get the current user
    const currentUser = await authUtils.getUserById(uid);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
    }

    // If user already has a wallet, verify the current wallet address matches
    if (
      currentUser.walletAddress &&
      currentUser.walletAddress !== currentWalletAddress
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Current wallet address does not match the account's linked wallet",
        error: "WALLET_MISMATCH",
      });
    }

    // Update or link the wallet address
    await authUtils.linkWalletToUser(uid, walletAddress);

    res.status(200).json({
      success: true,
      message: currentUser.walletAddress
        ? "Wallet address updated successfully"
        : "Wallet linked successfully",
      walletAddress: walletAddress,
    });
  } catch (error) {
    if (error.message === "Wallet already linked to another user") {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "WALLET_ALREADY_LINKED",
      });
    } else if (error.message === "User not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
        error: "USER_NOT_FOUND",
      });
    }
    handleError(res, error, "Failed to update wallet address");
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

    // Update last active timestamp and handle logout
    await authUtils.updateUserLastActive(uid);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
      instructions: "Please clear any stored tokens from your client storage",
    });
  } catch (error) {
    logger.error("Logout error:", error);

    if (error.message === "User ID is required") {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "MISSING_USER_ID",
      });
    } else if (
      error.message &&
      error.message.includes("No document to update")
    ) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
    }

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

// Check wallet availability
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

// Add backward compatibility routes
router.post("/anonymous", async (req, res) => {
  try {
    const { username } = req.body;

    // Forward to the unified authentication endpoint without wallet address
    const {
      uid,
      token,
      isNewUser,
      username: existingUsername,
      authType,
    } = await authUtils.unifiedWalletAuth(null, username);

    res.status(200).json({
      success: true,
      token,
      uid,
      isNewUser,
      username: existingUsername || username || null,
      authType,
      message: isNewUser
        ? "New anonymous user created"
        : "Logged in with existing username",
    });
  } catch (error) {
    if (error.message && error.message.includes("already taken")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_ALREADY_EXISTS",
      });
    } else if (
      error.message &&
      error.message.includes("Properties argument must be")
    ) {
      // Handle Firebase-specific error for invalid document updates
      return res.status(400).json({
        success: false,
        message: "Invalid data provided for authentication",
        error: "INVALID_DATA_FORMAT",
      });
    } else if (error.message && error.message.includes("Invalid user ID")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "INVALID_USER_ID",
      });
    }
    handleError(res, error, "Failed to process anonymous user request");
  }
});

router.post("/wallet/connect", async (req, res) => {
  try {
    const { walletAddress, username } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Wallet address is required",
      });
    }

    // Check first if wallet exists with a different username
    const existingUser = await authUtils.getUserByWallet(walletAddress);
    if (existingUser && username && existingUser.username !== username) {
      logger.info(
        `Using existing account with username '${existingUser.username}' instead of requested '${username}'`
      );

      // Forward to unified authentication but with a note about username difference
      const authResult = await authUtils.unifiedWalletAuth(walletAddress, null);

      return res.status(200).json({
        success: true,
        token: authResult.token,
        uid: authResult.uid,
        isNewUser: false,
        username: existingUser.username || null,
        requestedUsername: username,
        authType: "wallet",
        usernameChanged: false,
        message: `Authenticated with existing wallet. Note: This wallet address is already linked to username '${
          existingUser.username || "none"
        }', which differs from requested username '${username}'.`,
      });
    }

    // Standard authentication flow
    const {
      uid,
      token,
      isNewUser,
      username: existingUsername,
      authType,
    } = await authUtils.unifiedWalletAuth(walletAddress, username);

    res.status(200).json({
      success: true,
      token,
      uid,
      isNewUser,
      username: existingUsername || username || null,
      authType,
      message: isNewUser
        ? "New user created with wallet"
        : "Authenticated with existing wallet",
    });
  } catch (error) {
    if (
      error.message &&
      error.message.includes("already linked to a different wallet")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_HAS_DIFFERENT_WALLET",
      });
    } else if (error.message && error.message.includes("already taken")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "USERNAME_ALREADY_EXISTS",
      });
    } else if (
      error.message &&
      error.message.includes("Properties argument must be")
    ) {
      // Handle Firebase-specific error for invalid document updates
      return res.status(400).json({
        success: false,
        message: "Invalid data provided for authentication",
        error: "INVALID_DATA_FORMAT",
      });
    } else if (error.message && error.message.includes("Invalid user ID")) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "INVALID_USER_ID",
      });
    }
    handleError(res, error, "Failed to authenticate with wallet");
  }
});

module.exports = router;
