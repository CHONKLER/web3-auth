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
    // Check if username exists if provided
    if (username) {
      const usernameExists = await isUsernameExists(username);
      if (usernameExists) {
        throw new Error(`Username '${username}' is already taken`);
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
    return { uid: userRecord.uid, token: customToken, username };
  } catch (error) {
    logger.error("Error creating anonymous user:", error);
    throw error;
  }
};

/**
 * Unified wallet authentication - either connects a wallet to create/login a user
 * @param {string} walletAddress - The wallet address
 * @param {string} username - Optional username for new users
 * @returns {Promise<{uid: string, token: string, isNewUser: boolean, username: string}>} User data and token
 */
const unifiedWalletAuth = async (walletAddress, username = null) => {
  try {
    if (!walletAddress) {
      throw new Error("Wallet address is required");
    }

    const db = admin.firestore();

    // Check if a user with this wallet already exists
    const existingUser = await getUserByWallet(walletAddress);

    if (existingUser) {
      // User exists, generate a token for them
      const customToken = await admin
        .auth()
        .createCustomToken(existingUser.uid);

      // Update last active timestamp
      await db.collection("users").doc(existingUser.uid).update({
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(
        `User authenticated with wallet: ${walletAddress}, uid: ${existingUser.uid}`
      );
      return {
        uid: existingUser.uid,
        token: customToken,
        isNewUser: false,
        username: existingUser.username || null,
      };
    }

    // Check if username exists if provided
    if (username) {
      const usernameExists = await isUsernameExists(username);
      if (usernameExists) {
        throw new Error(`Username '${username}' is already taken`);
      }
    }

    // No user found with this wallet, create a new one
    const userRecord = await admin.auth().createUser();

    // Create user document in Firestore
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      username: username,
      walletAddress: walletAddress,
      isAnonymous: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
      walletLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Generate custom token
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    logger.info(
      `New user created with wallet: ${walletAddress}, uid: ${userRecord.uid}${
        username ? ", username: " + username : ""
      }`
    );
    return {
      uid: userRecord.uid,
      token: customToken,
      isNewUser: true,
      username: username,
    };
  } catch (error) {
    logger.error(`Error authenticating with wallet ${walletAddress}:`, error);
    throw error;
  }
};

/**
 * Link a wallet to a user account
 * @param {string} uid - The user ID
 * @param {string} walletAddress - The wallet address
 * @returns {Promise<boolean>} Success status
 */
const linkWalletToUser = async (uid, walletAddress) => {
  try {
    if (!walletAddress) {
      throw new Error("Wallet address is required");
    }

    // Check if wallet is already linked to another user
    const db = admin.firestore();
    const walletQuery = await db
      .collection("users")
      .where("walletAddress", "==", walletAddress)
      .get();

    if (!walletQuery.empty) {
      const existingUser = walletQuery.docs[0].data();
      if (existingUser.uid !== uid) {
        logger.warn(
          `Wallet ${walletAddress} already linked to user ${existingUser.uid}`
        );
        throw new Error("Wallet already linked to another user");
      }
      // Wallet already linked to this user, nothing to do
      return true;
    }

    // Update user document with wallet info
    await db.collection("users").doc(uid).update({
      walletAddress: walletAddress,
      isAnonymous: false,
      walletLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`Wallet ${walletAddress} linked to user ${uid}`);
    return true;
  } catch (error) {
    logger.error(`Error linking wallet to user ${uid}:`, error);
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

    return snapshot.docs[0].data();
  } catch (error) {
    logger.error(`Error getting user by wallet: ${walletAddress}`, error);
    throw error;
  }
};

/**
 * Update a user's last active timestamp
 * @param {string} uid - The user ID
 * @returns {Promise<boolean>} Success status
 */
const updateUserLastActive = async (uid) => {
  try {
    const db = admin.firestore();
    await db.collection("users").doc(uid).update({
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });
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

    return doc.data();
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
  updateUserLastActive,
  getUserById,
};
