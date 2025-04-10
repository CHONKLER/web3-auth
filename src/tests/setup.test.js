require("dotenv").config();
const admin = require("firebase-admin");
const logger = require("../utils/logger");

// Initialize Firebase Admin
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

// Initialize Firebase if it hasn't been initialized yet
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    });
    logger.info("Firebase Admin initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize Firebase Admin:", error);
    process.exit(1);
  }
}

async function testFirebaseSetup() {
  try {
    // Test Firestore connection
    const db = admin.firestore();
    const testDoc = db.collection("test").doc("test");

    try {
      await testDoc.set({ test: "test" });
      await testDoc.delete();
      logger.info("Firebase setup test passed successfully");
      return true;
    } catch (error) {
      if (error.code === 7) {
        // PERMISSION_DENIED
        logger.error("Firestore API is not enabled. Please enable it at:");
        logger.error(
          `https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=${process.env.FIREBASE_PROJECT_ID}`
        );
        return false;
      }
      throw error;
    }
  } catch (error) {
    logger.error("Firebase setup test failed:", error);
    return false;
  }
}

async function runTests() {
  logger.info("Starting setup tests...");

  const firebaseResult = await testFirebaseSetup();

  if (firebaseResult) {
    logger.info("All setup tests passed successfully!");
    process.exit(0);
  } else {
    logger.error("Some setup tests failed. Check the logs for details.");
    process.exit(1);
  }
}

runTests();
