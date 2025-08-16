import authService from './authService';
import userProfileService from './userProfileService';
import notificationService from './notificationService';

// ============================================================================
// AUTHENTICATION EXAMPLES
// ============================================================================

// 1. USER REGISTRATION
export const userRegistrationExample = async () => {
  try {
    // Email/Password registration
    const user = await authService.signUpWithEmail(
      'user@example.com',
      'password123',
      'username123'
    );
    
    console.log('User registered successfully:', user.uid);
    
    // User profile is automatically created with:
    // - username: 'username123'
    // - displayName: 'username123'
    // - photoURL: null
    // - pushToken: (automatically obtained from FCM)
    // - email: 'user@example.com'
    // - createdAt: (current timestamp)
    // - authMethod: 'email'
    // - lastLogin: (current timestamp)
    
    return user;
  } catch (error) {
    console.error('Registration failed:', error.message);
    throw error;
  }
};

// 2. USER LOGIN
export const userLoginExample = async () => {
  try {
    // Email/Password login
    const user = await authService.signInWithEmail(
      'user@example.com',
      'password123'
    );
    
    console.log('User logged in successfully:', user.uid);
    
    // Push token is automatically updated in user profile
    // lastLogin timestamp is updated
    
    return user;
  } catch (error) {
    console.error('Login failed:', error.message);
    throw error;
  }
};

// 3. GOOGLE SIGN-IN (Not yet implemented in Expo)
export const googleSignInExample = async () => {
  throw new Error('Google Sign-In not yet implemented in Expo. Use email/password or anonymous sign-in instead.');
};

// 4. APPLE SIGN-IN
export const appleSignInExample = async () => {
  try {
    const user = await authService.signInWithApple();
    
    console.log('Apple sign-in successful:', user.uid);
    
    // If new user, profile is created with Apple data
    // If existing user, push token and lastLogin are updated
    
    return user;
  } catch (error) {
    console.error('Apple sign-in failed:', error.message);
    throw error;
  }
};

// 5. ANONYMOUS SIGN-IN (for Solo mode)
export const anonymousSignInExample = async () => {
  try {
    const user = await authService.signInAnonymously();
    
    console.log('Anonymous sign-in successful:', user.uid);
    
    // Profile created with generated username
    // No email, but push token is still saved
    
    return user;
  } catch (error) {
    console.error('Anonymous sign-in failed:', error.message);
    throw error;
  }
};

// ============================================================================
// USER PROFILE MANAGEMENT EXAMPLES
// ============================================================================

// 6. UPDATE DISPLAY NAME
export const updateDisplayNameExample = async (newDisplayName) => {
  try {
    // Set current user first
    const currentUser = authService.getCurrentUser();
    userProfileService.setCurrentUser(currentUser);
    
    // Update display name
    await userProfileService.updateDisplayName(newDisplayName);
    
    console.log('Display name updated successfully');
    
    // Both Firebase Auth and Firestore are updated
    // lastUpdated timestamp is set
    
    return true;
  } catch (error) {
    console.error('Failed to update display name:', error.message);
    throw error;
  }
};

// 7. UPDATE PHOTO URL
export const updatePhotoURLExample = async (photoURL) => {
  try {
    const currentUser = authService.getCurrentUser();
    userProfileService.setCurrentUser(currentUser);
    
    await userProfileService.updatePhotoURL(photoURL);
    
    console.log('Photo URL updated successfully');
    
    // Both Firebase Auth and Firestore are updated
    // lastUpdated timestamp is set
    
    return true;
  } catch (error) {
    console.error('Failed to update photo URL:', error.message);
    throw error;
  }
};

// 8. UPDATE EMAIL
export const updateEmailExample = async (newEmail) => {
  try {
    const currentUser = authService.getCurrentUser();
    userProfileService.setCurrentUser(currentUser);
    
    await userProfileService.updateEmail(newEmail);
    
    console.log('Email updated successfully');
    
    // Only Firestore is updated (Firebase Auth email requires re-authentication)
    // lastUpdated timestamp is set
    
    return true;
  } catch (error) {
    console.error('Failed to update email:', error.message);
    throw error;
  }
};

// 9. UPDATE MULTIPLE PROFILE FIELDS
export const updateMultipleFieldsExample = async () => {
  try {
    const currentUser = authService.getCurrentUser();
    userProfileService.setCurrentUser(currentUser);
    
    const updates = {
      displayName: 'New Display Name',
      photoURL: 'https://example.com/photo.jpg',
      email: 'newemail@example.com'
    };
    
    await userProfileService.updateProfileFields(updates);
    
    console.log('Multiple profile fields updated successfully');
    
    // All fields are updated in both Firebase Auth and Firestore
    // lastUpdated timestamp is set
    
    return true;
  } catch (error) {
    console.error('Failed to update profile fields:', error.message);
    throw error;
  }
};

// 10. GET USER PROFILE
export const getUserProfileExample = async () => {
  try {
    const currentUser = authService.getCurrentUser();
    userProfileService.setCurrentUser(currentUser);
    
    const profile = await userProfileService.getCurrentUserProfile();
    
    console.log('User profile:', profile);
    
    // Returns complete user profile with all fields:
    // uid, username, displayName, photoURL, pushToken, email, 
    // createdAt, authMethod, lastLogin, lastUpdated, etc.
    
    return profile;
  } catch (error) {
    console.error('Failed to get user profile:', error.message);
    throw error;
  }
};

// ============================================================================
// PUSH TOKEN MANAGEMENT EXAMPLES
// ============================================================================

// 11. UPDATE PUSH TOKEN
export const updatePushTokenExample = async () => {
  try {
    const currentUser = authService.getCurrentUser();
    userProfileService.setCurrentUser(currentUser);
    
    const success = await userProfileService.updatePushToken();
    
    if (success) {
      console.log('Push token updated successfully');
    } else {
      console.log('No push token available');
    }
    
    return success;
  } catch (error) {
    console.error('Failed to update push token:', error.message);
    throw error;
  }
};

// 12. REFRESH PUSH TOKEN
export const refreshPushTokenExample = async () => {
  try {
    const currentUser = authService.getCurrentUser();
    userProfileService.setCurrentUser(currentUser);
    
    const success = await userProfileService.refreshPushToken();
    
    if (success) {
      console.log('Push token refreshed successfully');
    } else {
      console.log('No new token available');
    }
    
    return success;
  } catch (error) {
    console.error('Failed to refresh push token:', error.message);
    throw error;
  }
};

// 13. MANUAL PUSH TOKEN UPDATE
export const manualTokenUpdateExample = async () => {
  try {
    const currentUser = authService.getCurrentUser();
    
    // Update token directly through auth service
    const pushToken = await notificationService.getFCMToken();
    if (pushToken) {
      await authService.updateUserPushToken(currentUser.uid, pushToken);
      console.log('Push token updated manually');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to update push token manually:', error.message);
    throw error;
  }
};

// ============================================================================
// USER STATISTICS EXAMPLES
// ============================================================================

// 14. GET USER STATISTICS
export const getUserStatsExample = async (userId) => {
  try {
    const stats = await userProfileService.getUserStats(userId);
    
    console.log('User stats:', stats);
    
    // Returns: gamesPlayed, gamesWon, bestScore, createdAt, lastLogin
    
    return stats;
  } catch (error) {
    console.error('Failed to get user stats:', error.message);
    throw error;
  }
};

// 15. UPDATE USER STATISTICS
export const updateUserStatsExample = async (userId) => {
  try {
    const stats = {
      gamesPlayed: 10,
      gamesWon: 7,
      bestScore: 1500
    };
    
    await userProfileService.updateUserStats(userId, stats);
    
    console.log('User stats updated successfully');
    
    // lastUpdated timestamp is set
    
    return true;
  } catch (error) {
    console.error('Failed to update user stats:', error.message);
    throw error;
  }
};

// ============================================================================
// COMPLETE USER FLOW EXAMPLE
// ============================================================================

// 16. COMPLETE USER REGISTRATION AND SETUP FLOW
export const completeUserSetupFlow = async () => {
  try {
    // Step 1: Register user
    const user = await authService.signUpWithEmail(
      'newuser@example.com',
      'password123',
      'newuser123'
    );
    
    console.log('Step 1: User registered:', user.uid);
    
    // Step 2: Set up profile service
    userProfileService.setCurrentUser(user);
    
    // Step 3: Update profile with additional information
    await userProfileService.updateProfileFields({
      displayName: 'New User',
      photoURL: 'https://example.com/default-avatar.jpg'
    });
    
    console.log('Step 3: Profile updated');
    
    // Step 4: Ensure push token is saved
    await userProfileService.updatePushToken();
    
    console.log('Step 4: Push token saved');
    
    // Step 5: Get final profile
    const finalProfile = await userProfileService.getCurrentUserProfile();
    
    console.log('Step 5: Final profile:', finalProfile);
    
    return finalProfile;
  } catch (error) {
    console.error('Complete user setup failed:', error.message);
    throw error;
  }
};

// ============================================================================
// ERROR HANDLING EXAMPLES
// ============================================================================

// 17. HANDLE AUTHENTICATION ERRORS
export const handleAuthErrors = (error) => {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please provide a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please sign up.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    default:
      return 'An error occurred. Please try again.';
  }
};

// 18. VALIDATE USER INPUT
export const validateUserInput = (username, email, password) => {
  const errors = [];
  
  if (!username || username.trim().length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  
  if (!email || !email.includes('@')) {
    errors.push('Please provide a valid email address');
  }
  
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  
  return errors;
};

export default {
  userRegistrationExample,
  userLoginExample,
  googleSignInExample,
  appleSignInExample,
  anonymousSignInExample,
  updateDisplayNameExample,
  updatePhotoURLExample,
  updateEmailExample,
  updateMultipleFieldsExample,
  getUserProfileExample,
  updatePushTokenExample,
  refreshPushTokenExample,
  manualTokenUpdateExample,
  getUserStatsExample,
  updateUserStatsExample,
  completeUserSetupFlow,
  handleAuthErrors,
  validateUserInput
};
