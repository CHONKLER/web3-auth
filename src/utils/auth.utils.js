const admin = require("firebase-admin");
const logger = require("./logger");

/**
 * Check if a username already exists in the database
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} True if username exists, false otherwise
 */
const isUsernameExists = async (username) => {
  if (!username) return false;

  try {
    const db = admin.firestore();
    const usersRef = db.collection("users");
    const snapshot = await usersRef
      .where("username", "==", username)
      .limit(1)
      .get();
    return !snapshot.empty;
  } catch (error) {
    logger.error(`Error checking if username exists: ${username}`, error);
    throw error;
  }
};

/**
 * Check if a wallet address already exists in the database
 * @param {string} walletAddress - Wallet address to check
 * @returns {Promise<boolean>} True if wallet address exists, false otherwise
 */
const isWalletExists = async (walletAddress) => {
  if (!walletAddress) return false;

  try {
    const db = admin.firestore();
    const usersRef = db.collection("users");
    const snapshot = await usersRef
      .where("walletAddress", "==", walletAddress)
      .limit(1)
      .get();
    return !snapshot.empty;
  } catch (error) {
    logger.error(`Error checking if wallet exists: ${walletAddress}`, error);
    throw error;
  }
};

/**
 * Create an anonymous user in Firebase Auth and Firestore
 * @param {string} username - Optional username for the user
 * @returns {Promise<{uid: string, token: string}>} The user ID and custom token
 */
const createAnonymousUser = async (username = null) => {
  try {
    // Check if username exists and get the user if it does
    if (username) {
      // Log for debugging
      logger.info(`Checking if username ${username} exists...`);

      const existingUser = await getUserByUsername(username);

      // Log for debugging
      logger.info(
        `Existing user for username ${username}: ${
          existingUser ? existingUser.uid : "none"
        }`
      );

      if (existingUser) {
        // User with this username already exists, generate a token for them
        const customToken = await admin
          .auth()
          .createCustomToken(existingUser.uid || existingUser.id);

        // Update last active timestamp
        const db = admin.firestore();
        await db
          .collection("users")
          .doc(existingUser.uid || existingUser.id)
          .update({
            lastActive: admin.firestore.FieldValue.serverTimestamp(),
          });

        logger.info(
          `User logged in with existing username: ${username}, uid: ${
            existingUser.uid || existingUser.id
          }`
        );
        return {
          uid: existingUser.uid || existingUser.id,
          token: customToken,
          username: existingUser.username,
          isExistingUser: true,
        };
      }
    }

    // Create anonymous user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      anonymous: true,
    });

    // Create user document in Firestore
    const db = admin.firestore();
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      username: username,
      isAnonymous: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Generate custom token for authentication
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    logger.info(
      `Anonymous user created: ${userRecord.uid}${
        username ? ", username: " + username : ""
      }`
    );
    return {
      uid: userRecord.uid,
      token: customToken,
      username,
      isExistingUser: false,
    };
  } catch (error) {
    logger.error("Error creating anonymous user:", error);
    throw error;
  }
};

/**
 * Get a user by their username
 * @param {string} username - The username
 * @returns {Promise<object|null>} The user document or null if not found
 */
const getUserByUsername = async (username) => {
  if (!username) return null;

  try {
    const db = admin.firestore();
    const usersRef = db.collection("users");
    const snapshot = await usersRef
      .where("username", "==", username)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return { ...snapshot.docs[0].data(), id: snapshot.docs[0].id };
  } catch (error) {
    logger.error(`Error getting user by username: ${username}`, error);
    throw error;
  }
};

/**
 * Unified authentication - handles both wallet and anonymous authentication
 * @param {string} walletAddress - Optional wallet address for wallet auth
 * @param {string} username - Optional username for new users
 * @returns {Promise<{uid: string, token: string, isNewUser: boolean, username: string, authType: string}>} User data and token
 */
const unifiedWalletAuth = async (walletAddress = null, username = null) => {
  try {
    const db = admin.firestore();
    let existingUser = null;
    let isAnonymous = !walletAddress;
    let firebaseAuthUid = null;

    // If wallet provided, check if a user with this wallet already exists
    if (walletAddress) {
      existingUser = await getUserByWallet(walletAddress);

      logger.info(
        `Existing user for wallet ${walletAddress}: ${
          existingUser ? existingUser.uid || existingUser.id : "none"
        }`
      );

      // If user exists with this wallet, we use that account regardless of username provided
      if (existingUser) {
        // If a different username was provided, we log it but don't try to update anything
        if (username && existingUser.username !== username) {
          logger.info(
            `User with wallet ${walletAddress} exists with username '${
              existingUser.username || "none"
            }' instead of requested '${username}'. Using existing account without changes.`
          );
        }

        // User exists, generate a token for them
        const userId = existingUser.uid || existingUser.id;
        firebaseAuthUid = userId;

        // Make sure userId is a valid string to avoid Firebase errors
        if (!userId || typeof userId !== "string") {
          throw new Error(`Invalid user ID: ${userId}`);
        }

        // Create a custom token for Firebase Auth
        const customToken = await admin.auth().createCustomToken(userId);

        // Just update last active timestamp - don't touch any other fields
        await db.collection("users").doc(userId).update({
          lastActive: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info(
          `User authenticated with wallet: ${walletAddress}, uid: ${userId}`
        );

        return {
          uid: userId,
          token: customToken,
          isNewUser: false,
          username: existingUser.username || null,
          authType: "wallet",
        };
      }
    }

    // If user not found by wallet (or no wallet) but username is provided, check if user exists by username
    if (!existingUser && username) {
      existingUser = await getUserByUsername(username);

      logger.info(
        `Existing user for username ${username}: ${
          existingUser ? existingUser.uid || existingUser.id : "none"
        }`
      );

      // If a user with the username exists and wallet is provided, check wallet compatibility
      if (existingUser && walletAddress) {
        if (existingUser.walletAddress) {
          // User already has a wallet, don't allow changing it
          throw new Error(
            `Username '${username}' is already linked to a different wallet address`
          );
        } else {
          // First time linking a wallet to this username
          const userId = existingUser.uid || existingUser.id;
          firebaseAuthUid = userId;

          await db.collection("users").doc(userId).update({
            walletAddress: walletAddress,
            isAnonymous: false,
            lastActive: admin.firestore.FieldValue.serverTimestamp(),
            walletLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Refresh user data after update
          existingUser = await getUserById(userId);
        }
      }
    }

    if (existingUser) {
      // User exists, generate a token for them
      const userId = existingUser.uid || existingUser.id;
      firebaseAuthUid = userId;

      // Make sure userId is a valid string to avoid Firebase errors
      if (!userId || typeof userId !== "string") {
        throw new Error(`Invalid user ID: ${userId}`);
      }

      // Create a custom token for Firebase Auth
      const customToken = await admin.auth().createCustomToken(userId);

      // Update last active timestamp
      await db.collection("users").doc(userId).update({
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(
        `User authenticated ${
          walletAddress ? `with wallet: ${walletAddress}` : "anonymously"
        }, uid: ${userId}`
      );

      return {
        uid: userId,
        token: customToken,
        isNewUser: false,
        username: existingUser.username || null,
        authType: walletAddress ? "wallet" : "anonymous",
      };
    }

    // No user found, create a new one
    // Check username uniqueness if username is provided
    if (username) {
      const usernameExists = await isUsernameExists(username);
      if (usernameExists) {
        throw new Error(`Username '${username}' is already taken`);
      }
    }

    try {
      // Create a new user in Firebase Auth first
      let authUser;

      if (isAnonymous) {
        // Create an anonymous user in Firebase Auth
        authUser = await admin.auth().createUser({
          disabled: false,
        });
      } else {
        // Create a regular user in Firebase Auth
        authUser = await admin.auth().createUser({
          disabled: false,
        });
      }

      firebaseAuthUid = authUser.uid;

      // Create user document in Firestore
      const userData = {
        uid: authUser.uid,
        username: username,
        isAnonymous: isAnonymous,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Only add wallet-related fields if a wallet is provided
      if (walletAddress) {
        userData.walletAddress = walletAddress;
        userData.walletLinkedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      await db.collection("users").doc(authUser.uid).set(userData);

      // Generate custom token for Firebase Auth
      const customToken = await admin.auth().createCustomToken(authUser.uid);

      logger.info(
        `New user created ${
          walletAddress ? `with wallet: ${walletAddress}` : "anonymously"
        }, uid: ${authUser.uid}${username ? ", username: " + username : ""}`
      );

      return {
        uid: authUser.uid,
        token: customToken,
        isNewUser: true,
        username: username,
        authType: walletAddress ? "wallet" : "anonymous",
      };
    } catch (error) {
      logger.error(`Error creating new user: ${error.message}`);
      if (error.code === "auth/invalid-argument") {
        throw new Error(
          "Invalid data format for user creation. Please check your username and wallet address."
        );
      }
      throw error;
    }
  } catch (error) {
    logger.error(
      `Error authenticating user${
        walletAddress ? ` with wallet ${walletAddress}` : ""
      }:`,
      error
    );
    throw error;
  }
};

/**
 * Link or update wallet address to user
 * @param {string} uid - The user ID
 * @param {string} walletAddress - The wallet address
 * @returns {Promise<boolean>} Success status
 */
const linkWalletToUser = async (uid, walletAddress) => {
  try {
    // Get the user document
    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();

    // Check if the wallet is already linked to another user
    const walletQuery = await db
      .collection("users")
      .where("walletAddress", "==", walletAddress)
      .get();

    if (!walletQuery.empty) {
      const existingUser = walletQuery.docs[0];
      if (existingUser.id !== uid) {
        throw new Error("Wallet already linked to another user");
      }
    }

    // Update the user document with the new wallet address
    await userRef.update({
      walletAddress,
      walletLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    logger.error("Error linking wallet to user:", error);
    throw error;
  }
};

/**
 * Update a user's username
 * @param {string} uid - The user ID
 * @param {string} username - The new username
 * @returns {Promise<boolean>} Success status
 */
const updateUsername = async (uid, username) => {
  try {
    if (!uid || !username) {
      throw new Error("User ID and username are required");
    }

    // Check if username exists
    const usernameExists = await isUsernameExists(username);
    if (usernameExists) {
      throw new Error(`Username '${username}' is already taken`);
    }

    const db = admin.firestore();
    await db.collection("users").doc(uid).update({
      username: username,
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`Username updated for user ${uid}: ${username}`);
    return true;
  } catch (error) {
    logger.error(`Error updating username for user ${uid}:`, error);
    throw error;
  }
};

/**
 * Get a user by their wallet address
 * @param {string} walletAddress - The wallet address
 * @returns {Promise<object|null>} The user document or null if not found
 */
const getUserByWallet = async (walletAddress) => {
  try {
    const db = admin.firestore();
    const usersRef = db.collection("users");
    const snapshot = await usersRef
      .where("walletAddress", "==", walletAddress)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return { ...snapshot.docs[0].data(), id: snapshot.docs[0].id };
  } catch (error) {
    logger.error(`Error getting user by wallet: ${walletAddress}`, error);
    throw error;
  }
};

/**
 * Update a user's last active timestamp and handle logout
 * @param {string} uid - The user ID
 * @returns {Promise<boolean>} Success status
 */
const updateUserLastActive = async (uid) => {
  try {
    if (!uid) {
      throw new Error("User ID is required");
    }

    // Update Firestore user document
    const db = admin.firestore();
    await db.collection("users").doc(uid).update({
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
      lastLogout: admin.firestore.FieldValue.serverTimestamp(),
    });

    // We don't actually revoke Firebase tokens here since Firebase doesn't provide a direct
    // way to invalidate custom tokens. Instead, we rely on token expiration.
    // The frontend should clear tokens from storage on logout.

    logger.info(`User ${uid} logged out successfully`);
    return true;
  } catch (error) {
    logger.error(`Error updating last active for user ${uid}:`, error);
    throw error;
  }
};

/**
 * Get a user by their ID
 * @param {string} uid - The user ID
 * @returns {Promise<object|null>} The user document or null if not found
 */
const getUserById = async (uid) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      return null;
    }

    return { ...doc.data(), id: doc.id };
  } catch (error) {
    logger.error(`Error getting user by ID: ${uid}`, error);
    throw error;
  }
};

module.exports = {
  isUsernameExists,
  isWalletExists,
  createAnonymousUser,
  unifiedWalletAuth,
  linkWalletToUser,
  updateUsername,
  getUserByWallet,
  getUserByUsername,
  updateUserLastActive,
  getUserById,
};
