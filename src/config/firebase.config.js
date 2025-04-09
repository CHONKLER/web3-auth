const admin = require("firebase-admin");

// Load environment variables if not already loaded
if (!process.env.FIREBASE_PROJECT_ID) {
  require("dotenv").config();
}

// Initialize Firebase Admin if it hasn't been initialized yet
if (!admin.apps.length) {
  try {
    // Construct service account from environment variables
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      // Ensure the private key is properly formatted
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    });

    console.log("Firebase Admin initialized successfully");

    // Initialize Firestore
    const db = admin.firestore();
    db.settings({ timestampsInSnapshots: true });
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
    console.error("Environment variables:");
    console.error(`Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
    console.error(`Client Email: ${process.env.FIREBASE_CLIENT_EMAIL}`);
    process.exit(1);
  }
}

module.exports = admin;
