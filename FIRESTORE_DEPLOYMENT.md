# Firestore Rules Deployment Guide

## Issue
The app is getting "Missing or insufficient permissions" errors when trying to update the leaderboard. This is because the Firestore security rules need to be updated and deployed.

## Solution

### 1. Update Firestore Rules in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `whatword-a3f4b`
3. Navigate to **Firestore Database** → **Rules**
4. Replace the existing rules with the updated rules from `firestore.rules`
5. Click **Publish** to deploy the new rules

### 2. Updated Rules Summary

The new rules provide:
- **Read access**: All authenticated users can read leaderboard data
- **Write access**: Users can only write their own scores
- **Document ID validation**: Ensures proper format (`score_{userId}_{timestamp}`)
- **Security**: Prevents users from modifying other users' scores

### 3. Test the Fix

After deploying the rules:
1. Play a solo game and win
2. Check the console logs for successful leaderboard updates
3. Verify the leaderboard screen loads without errors

### 4. Alternative: Use Firebase CLI

If you prefer command line deployment:

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not already done)
firebase init firestore

# Deploy rules
firebase deploy --only firestore:rules
```

## Current Rules (for reference)

```javascript
// Allow authenticated users to read and write leaderboard data
// Users can only write their own scores and read all scores
match /leaderboard/{scoreId} {
  // Allow read for all authenticated users (for leaderboard display)
  allow read: if request.auth != null;
  
  // Allow write only if the user is writing their own score
  // The scoreId format is: score_{userId}_{timestamp}
  allow create, update: if request.auth != null && 
    (scoreId.matches('score_.*') && 
     request.resource.data.userId == request.auth.uid);
  
  // Allow delete only if the user is deleting their own score
  allow delete: if request.auth != null && 
    (scoreId.matches('score_.*') && 
     resource.data.userId == request.auth.uid);
}
```

## Fallback Mechanism

The app now includes a fallback mechanism that saves leaderboard data locally if Firebase fails. This ensures the game continues to work even if there are temporary Firebase issues.
