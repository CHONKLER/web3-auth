const admin = require("firebase-admin");

class User {
  constructor() {
    this.db = admin.firestore();
    this.usersCollection = this.db.collection("users");
  }

  async createAnonymousUser(uid) {
    try {
      await this.usersCollection.doc(uid).set({
        uid,
        isAnonymous: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Error creating anonymous user:", error);
      throw error;
    }
  }

  async linkWallet(uid, publicKey) {
    try {
      await this.usersCollection.doc(uid).update({
        walletAddress: publicKey,
        isAnonymous: false,
        walletConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Error linking wallet:", error);
      throw error;
    }
  }

  async getUserByWallet(publicKey) {
    try {
      const snapshot = await this.usersCollection
        .where("walletAddress", "==", publicKey)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return snapshot.docs[0].data();
    } catch (error) {
      console.error("Error getting user by wallet:", error);
      throw error;
    }
  }

  async updateLastActive(uid) {
    try {
      await this.usersCollection.doc(uid).update({
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating last active:", error);
      throw error;
    }
  }
}

module.exports = new User();
