# Web3 Authentication Server

A Node.js/Express server that handles authentication through Firebase and wallet connection in a unified approach.

## Features

- Unified Authentication System (supports both wallet and anonymous authentication)
- Wallet linking to existing accounts
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

### 1. Unified Authentication (with or without wallet)

```javascript
// Authenticate with unified endpoint (with or without wallet)
const authenticate = async (walletAddress = null, username = null) => {
  try {
    const response = await fetch(
      "http://localhost:3589/api/auth/authenticate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress, // Optional - omit for anonymous auth
          username, // Optional
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      if (data.error === "USERNAME_ALREADY_EXISTS") {
        console.error("Username already exists:", data.message);
        return { error: data.error, message: data.message };
      } else if (data.error === "USERNAME_HAS_DIFFERENT_WALLET") {
        console.error("Username has different wallet:", data.message);
        return { error: data.error, message: data.message };
      }
      throw new Error(data.message || "Failed to authenticate");
    }

    const {
      uid,
      token,
      username: responseUsername,
      authType,
      isNewUser,
    } = data;
    return { uid, token, username: responseUsername, authType, isNewUser };
  } catch (error) {
    console.error("Error authenticating:", error);
    throw error;
  }
};

// For anonymous authentication only
const signInAnonymously = async (username = null) => {
  return authenticate(null, username);
};

// For wallet authentication
const connectWallet = async (walletAddress, username = null) => {
  return authenticate(walletAddress, username);
};
```

### 2. Link Wallet to Existing Account

```javascript
// Link wallet to an existing account
const linkWallet = async (uid, walletAddress) => {
  // Send to backend
  const response = await fetch("http://localhost:3589/api/auth/wallet/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      walletAddress,
      uid, // From previous authentication
    }),
  });

  return await response.json();
};
```

## API Endpoints

### Authentication

- `POST /api/auth/authenticate`

  - Unified authentication endpoint for both wallet and anonymous authentication
  - Request body: `{ walletAddress?: string, username?: string }`
  - Response: `{ success: true, token: string, uid: string, isNewUser: boolean, username: string|null, authType: string, message: string }`
  - Error responses:
    - `400 Bad Request`: If username already exists or is linked to a different wallet
    - `500 Internal Server Error`: For other errors

- `POST /api/auth/wallet/link`

  - Links a wallet to an existing user account
  - Request body: `{ walletAddress: string, uid: string }`
  - Response: `{ success: true, message: string, walletAddress: string }`
  - Error responses:
    - `400 Bad Request`: If wallet is already linked to another user or user already has a different wallet
    - `404 Not Found`: If user not found
    - `500 Internal Server Error`: For other errors

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

## Backward Compatibility

For backward compatibility, the following endpoints are still supported but redirect to the new unified authentication system:

- `POST /api/auth/anonymous` - For anonymous authentication (no wallet)
- `POST /api/auth/wallet/connect` - For wallet authentication

We recommend using the new `/api/auth/authenticate` endpoint for new integrations.

## Authentication Flows

### 1. Anonymous Flow

1. User authenticates without a wallet address
2. Optionally provides a username
3. Receives `uid` and `token`
4. Can later link a wallet using the `uid`

### 2. Wallet Authentication Flow

1. User authenticates with a wallet address
2. Server checks if wallet address exists
   - If exists: Logs in the user
   - If not: Creates new account
3. Returns `uid`, `token`, and `isNewUser` flag

### 3. Hybrid Flow

1. User starts without a wallet (anonymous authentication)
2. Later links their wallet
3. Account becomes non-anonymous

## Key Changes in Recent Updates

1. **Unified Authentication System**: Merged anonymous and wallet authentication into a single, flexible endpoint:

   - Simplifies integration for developers
   - Consistent response format for all authentication methods
   - Improved security and user identification

2. **Permanent Wallet-Username Association**:

   - Once a username is linked to a wallet, that association cannot be changed
   - Prevents security issues from changing wallet addresses

3. **Improved Username Handling**:
   - When a user tries to authenticate with an existing username, they're logged in instead of seeing an error
   - Prevents duplicate accounts with the same username

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
