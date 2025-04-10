# Web3 Authentication Server

A Node.js/Express server that handles authentication through Firebase anonymous login and wallet connection.

## Features

- Firebase Anonymous Authentication (with optional username)
- Wallet Address Authentication (direct flow without signature verification)
- Wallet linking to anonymous accounts
- Username management with uniqueness validation
- Secure API endpoints
- Error handling middleware
- Environment-based configuration

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Firebase project with Admin SDK credentials

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:

   ```
   PORT=3589
   NODE_ENV=development

   # Firebase Configuration
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
   FIREBASE_PRIVATE_KEY_ID=your-private-key-id
   FIREBASE_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
   FIREBASE_CLIENT_ID=your-client-id
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Authentication Procedures

### 1. Anonymous Sign-in (Optional Username)

```javascript
// Sign in anonymously with optional username
const signInAnonymously = async (username = null) => {
  try {
    const response = await fetch("http://localhost:3589/api/auth/anonymous", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.error === "USERNAME_ALREADY_EXISTS") {
        console.error("Username already exists:", data.message);
        // Handle username already exists error
        return { error: data.error, message: data.message };
      }
      throw new Error(data.message || "Failed to sign in anonymously");
    }

    const { uid, token, username: responseUsername } = data;
    // Store uid and token for later use
    return { uid, token, username: responseUsername };
  } catch (error) {
    console.error("Error signing in anonymously:", error);
    throw error;
  }
};
```

### 2. Link Wallet to Existing Anonymous Account

```javascript
// Link wallet to an existing anonymous account
const linkWallet = async (uid, walletAddress) => {
  // Send to backend
  const response = await fetch("http://localhost:3589/api/auth/wallet/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      walletAddress,
      uid, // From anonymous sign-in
    }),
  });

  return await response.json();
};
```

### 3. Unified Wallet Authentication (Login or Create)

```javascript
// Authenticate with wallet (login existing or create new)
const connectWallet = async (walletAddress, username = null) => {
  try {
    // Send to backend
    const response = await fetch(
      "http://localhost:3589/api/auth/wallet/connect",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          username, // Optional
        }),
      }
    );

    const {
      uid,
      token,
      isNewUser,
      username: responseUsername,
    } = await response.json();
    // Store uid and token for later use
    return { uid, token, isNewUser, username: responseUsername };
  } catch (error) {
    console.error("Error authenticating with wallet:", error);
    throw error;
  }
};
```

## API Endpoints

### Authentication

- `POST /api/auth/anonymous`

  - Creates an anonymous user and returns a custom token
  - Request body (optional): `{ username: string }`
  - Response: `{ success: true, token: string, uid: string, username: string|null }`
  - Error responses:
    - `400 Bad Request`: If username already exists
    - `500 Internal Server Error`: For other errors

- `POST /api/auth/wallet/connect`

  - Unified wallet authentication endpoint (sign in or create new)
  - Request body: `{ walletAddress: string, username?: string }`
  - Response: `{ success: true, token: string, uid: string, isNewUser: boolean, username: string|null, message: string }`
  - Error responses:
    - `400 Bad Request`: If username already exists
    - `500 Internal Server Error`: For other errors

- `POST /api/auth/wallet/link`

  - Links a wallet to an existing user account
  - Request body: `{ walletAddress: string, uid: string }`
  - Response: `{ success: true, message: string, walletAddress: string }`

- `POST /api/auth/username`

  - Updates a user's username
  - Request body: `{ uid: string, username: string }`
  - Response: `{ success: true, message: string, username: string }`
  - Error responses:
    - `400 Bad Request`: If username already exists or user ID is missing
    - `500 Internal Server Error`: For other errors

- `POST /api/auth/logout`

  - Handles user logout
  - Request body: `{ uid: string }`
  - Response: `{ success: true, message: string }`

- `GET /api/auth/user/:uid`

  - Gets user profile information
  - Response: `{ success: true, user: { uid, username, isAnonymous, hasWallet, walletAddress, createdAt, lastActive, walletLinkedAt } }`

- `GET /api/auth/username/available/:username`

  - Checks if a username is available
  - Response: `{ success: true, available: boolean }`

- `GET /api/auth/wallet/available/:walletAddress`
  - Checks if a wallet address is available
  - Response: `{ success: true, available: boolean }`

## Authentication Flows

### 1. Anonymous Flow (Optional Username)

1. User signs in anonymously
2. Optionally provides a username
3. Receives `uid` and `token`
4. Can later link a wallet using the `uid`

### 2. Wallet Connection Flow

1. User connects their wallet on the frontend
2. Frontend sends the wallet address to the server
3. Server checks if wallet exists
   - If exists: Logs in the user
   - If not: Creates new account
4. Returns `uid`, `token`, and `isNewUser` flag

### 3. Hybrid Flow

1. User starts with anonymous account
2. Later links their wallet
3. Account becomes non-anonymous

## Key Changes in Recent Updates

1. **Removed @solana/web3.js Dependency**: The backend no longer depends on Solana's web3.js library as wallet management is handled on the frontend.

2. **Simplified Authentication Flow**: Wallet authentication now uses direct wallet addresses without needing signature verification:

   - Frontend is responsible for connecting to wallets and obtaining addresses
   - Backend only needs the wallet address to authenticate or create users

3. **Unique User Identification**: Implemented checks for both username and wallet address:

   - Before creating a new account, the system checks if the wallet address or username already exists
   - If a user already exists with that wallet, they are signed in rather than creating a duplicate account

4. **New Availability Endpoints**: Added endpoints to check if usernames or wallet addresses are already taken:
   - `GET /api/auth/username/available/:username`
   - `GET /api/auth/wallet/available/:walletAddress`

## Firestore Security Rules

The project includes Firestore security rules to protect user data. To deploy these rules:

1. Install Firebase CLI:

   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:

   ```bash
   firebase login
   ```

3. Initialize Firebase in your project (if not already done):

   ```bash
   firebase init
   ```

   - Select Firestore
   - Choose your project
   - Accept the default file names for rules

4. Deploy the Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

The security rules provide the following protections:

- Users can only read and write their own data
- Only authenticated users can create documents
- Users cannot delete their profiles (optional, can be changed)
- Test collection is accessible for setup verification

## Frontend Integration

### Wallet Connection Example

Here's how to integrate wallet connection in your frontend application:

```javascript
const connectWallet = async () => {
  try {
    // Connect to wallet using your frontend library
    // This will be specific to your frontend wallet integration
    const walletAddress = "your-wallet-address";

    // Send to backend
    const response = await fetch(
      "http://localhost:3589/api/auth/wallet/connect",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          username: "optional-username", // Optional
        }),
      }
    );

    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error("Error connecting wallet:", error);
  }
};
```

### Authentication Flow

1. **Anonymous Sign-in**:

   ```javascript
   // First, sign in anonymously
   const signInAnonymously = async () => {
     const response = await fetch("http://localhost:3589/api/auth/anonymous", {
       method: "POST",
     });
     const { uid, token } = await response.json();
     // Store uid and token for later use
     return { uid, token };
   };
   ```

2. **Wallet Connection**:

   - After anonymous sign-in, use the returned `uid` to connect the wallet
   - The wallet connection will be linked to the anonymous account

3. **Logout**:
   ```javascript
   const logout = async (uid) => {
     const response = await fetch("http://localhost:3589/api/auth/logout", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
       },
       body: JSON.stringify({ uid }),
     });
     const data = await response.json();
     // Clear local storage/session
   };
   ```

## Development

- Run in development mode with hot reload:

  ```bash
  npm run dev
  ```

- Run in production mode:

  ```bash
  npm start
  ```

- Run setup tests:
  ```bash
  npm test
  ```

## Security

- All sensitive data is stored in environment variables
- Helmet middleware for security headers
- CORS enabled for cross-origin requests
- Error handling with appropriate status codes
- Firestore security rules to protect user data

## License

ISC
