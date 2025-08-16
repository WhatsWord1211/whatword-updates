import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from './firebase';
import { getNotificationService } from './notificationService';

class UserProfileService {
  constructor() {
    this.currentUser = null;
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  // Get current user's profile
  async getCurrentUserProfile() {
    try {
      if (!this.currentUser) {
        throw new Error('No user authenticated');
      }
      
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      if (userDoc.exists()) {
        return { uid: this.currentUser.uid, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('UserProfileService: Failed to get current user profile:', error);
      throw error;
    }
  }

  // Update user's display name
  async updateDisplayName(newDisplayName) {
    try {
      if (!this.currentUser) {
        throw new Error('No user authenticated');
      }

      if (!newDisplayName || newDisplayName.trim().length < 2) {
        throw new Error('Display name must be at least 2 characters long');
      }

      const trimmedName = newDisplayName.trim();

      // Update Firebase Auth profile
      await updateProfile(this.currentUser, {
        displayName: trimmedName
      });

      // Update Firestore user document
      await updateDoc(doc(db, 'users', this.currentUser.uid), {
        displayName: trimmedName,
        lastUpdated: new Date().toISOString()
      });

      console.log('UserProfileService: Display name updated successfully');
      return true;
    } catch (error) {
      console.error('UserProfileService: Failed to update display name:', error);
      throw error;
    }
  }

  // Update user's photo URL
  async updatePhotoURL(photoURL) {
    try {
      if (!this.currentUser) {
        throw new Error('No user authenticated');
      }

      // Update Firebase Auth profile
      await updateProfile(this.currentUser, {
        photoURL: photoURL
      });

      // Update Firestore user document
      await updateDoc(doc(db, 'users', this.currentUser.uid), {
        photoURL: photoURL,
        lastUpdated: new Date().toISOString()
      });

      console.log('UserProfileService: Photo URL updated successfully');
      return true;
    } catch (error) {
      console.error('UserProfileService: Failed to update photo URL:', error);
      throw error;
    }
  }

  // Update user's email
  async updateEmail(newEmail) {
    try {
      if (!this.currentUser) {
        throw new Error('No user authenticated');
      }

      if (!newEmail || !newEmail.includes('@')) {
        throw new Error('Please provide a valid email address');
      }

      // Update Firestore user document
      await updateDoc(doc(db, 'users', this.currentUser.uid), {
        email: newEmail,
        lastUpdated: new Date().toISOString()
      });

      console.log('UserProfileService: Email updated successfully');
      return true;
    } catch (error) {
      console.error('UserProfileService: Failed to update email:', error);
      throw error;
    }
  }

  // Update user's push token
  async updatePushToken() {
    try {
      if (!this.currentUser) {
        throw new Error('No user authenticated');
      }

      const pushToken = await getNotificationService().getFCMToken();
      if (pushToken) {
        await updateDoc(doc(db, 'users', this.currentUser.uid), {
          pushToken: pushToken,
          lastTokenUpdate: new Date().toISOString()
        });
        console.log('UserProfileService: Push token updated successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.error('UserProfileService: Failed to update push token:', error);
      throw error;
    }
  }

  // Refresh user's push token
  async refreshPushToken() {
    try {
      if (!this.currentUser) {
        throw new Error('No user authenticated');
      }

      const newToken = await getNotificationService().refreshAndUpdateToken(this.currentUser.uid);
      if (newToken) {
        await updateDoc(doc(db, 'users', this.currentUser.uid), {
          pushToken: newToken,
          lastTokenUpdate: new Date().toISOString()
        });
        console.log('UserProfileService: Push token refreshed successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.error('UserProfileService: Failed to refresh push token:', error);
      throw error;
    }
  }

  // Update multiple profile fields at once
  async updateProfileFields(updates) {
    try {
      if (!this.currentUser) {
        throw new Error('No user authenticated');
      }

      // Validate updates
      const allowedFields = ['displayName', 'photoURL', 'email'];
      const validUpdates = {};
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined && value !== null) {
          validUpdates[key] = value;
        }
      }

      if (Object.keys(validUpdates).length === 0) {
        throw new Error('No valid fields to update');
      }

      // Add timestamp
      validUpdates.lastUpdated = new Date().toISOString();

      // Update Firestore user document
      await updateDoc(doc(db, 'users', this.currentUser.uid), validUpdates);

      // Update Firebase Auth profile if displayName or photoURL changed
      const authUpdates = {};
      if (validUpdates.displayName) authUpdates.displayName = validUpdates.displayName;
      if (validUpdates.photoURL) authUpdates.photoURL = validUpdates.photoURL;

      if (Object.keys(authUpdates).length > 0) {
        await updateProfile(this.currentUser, authUpdates);
      }

      console.log('UserProfileService: Profile fields updated successfully');
      return true;
    } catch (error) {
      console.error('UserProfileService: Failed to update profile fields:', error);
      throw error;
    }
  }

  // Get user profile by ID
  async getUserProfileById(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return { uid: userId, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('UserProfileService: Failed to get user profile by ID:', error);
      throw error;
    }
  }

  // Check if user profile exists
  async doesUserProfileExist(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      return userDoc.exists();
    } catch (error) {
      console.error('UserProfileService: Failed to check if user profile exists:', error);
      return false;
    }
  }

  // Create or update user profile (for migration purposes)
  async createOrUpdateUserProfile(userId, userData) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        // Update existing profile
        await updateDoc(doc(db, 'users', userId), {
          ...userData,
          lastUpdated: new Date().toISOString()
        });
        console.log('UserProfileService: User profile updated successfully');
      } else {
        // Create new profile
        await setDoc(doc(db, 'users', userId), {
          uid: userId,
          ...userData,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        });
        console.log('UserProfileService: User profile created successfully');
      }
      
      return true;
    } catch (error) {
      console.error('UserProfileService: Failed to create or update user profile:', error);
      throw error;
    }
  }

  // Get user statistics
  async getUserStats(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          gamesPlayed: userData.gamesPlayed || 0,
          gamesWon: userData.gamesWon || 0,
          bestScore: userData.bestScore || 0,
          createdAt: userData.createdAt,
          lastLogin: userData.lastLogin
        };
      }
      return null;
    } catch (error) {
      console.error('UserProfileService: Failed to get user stats:', error);
      throw error;
    }
  }

  // Update user statistics
  async updateUserStats(userId, stats) {
    try {
      const allowedStats = ['gamesPlayed', 'gamesWon', 'bestScore'];
      const validStats = {};
      
      for (const [key, value] of Object.entries(stats)) {
        if (allowedStats.includes(key) && typeof value === 'number') {
          validStats[key] = value;
        }
      }

      if (Object.keys(validStats).length === 0) {
        throw new Error('No valid stats to update');
      }

      await updateDoc(doc(db, 'users', userId), {
        ...validStats,
        lastUpdated: new Date().toISOString()
      });

      console.log('UserProfileService: User stats updated successfully');
      return true;
    } catch (error) {
      console.error('UserProfileService: Failed to update user stats:', error);
      throw error;
    }
  }
}

export default new UserProfileService();
