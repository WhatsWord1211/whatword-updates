import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  linkWithCredential, 
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, appleProvider } from './firebase';
// Google Sign-In will be handled via Expo AuthSession
// import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { signInWithCredential, signInAnonymously } from 'firebase/auth';
import { getNotificationService } from './notificationService';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
  }

  // Email/Password Authentication
  async signUpWithEmail(email, password, username) {
    try {
      // Check if username is already taken
      const isUsernameTaken = await this.isUsernameTaken(username);
      if (isUsernameTaken) {
        throw new Error('Username is already taken. Please choose another one.');
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update profile with username
      await updateProfile(user, {
        displayName: username
      });

      // Create user document in Firestore immediately
      await this.createUserProfile(user.uid, {
        username,
        displayName: username,
        photoURL: null,
        pushToken: null, // Will be updated later
        email,
        createdAt: new Date().toISOString(),
        authMethod: 'email',
        lastLogin: new Date().toISOString()
      });

      // Get FCM token in background without blocking
      setTimeout(() => {
        getNotificationService().getFCMToken().then(async (pushToken) => {
          if (pushToken) {
            try {
              await this.updateUserProfile(user.uid, { pushToken });
            } catch (error) {
              console.error('AuthService: Failed to update push token:', error);
            }
          }
        }).catch(console.error);
      }, 500);

      return user;
    } catch (error) {
      console.error('AuthService: Sign up failed:', error);
      throw error;
    }
  }

  async signInWithEmail(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update user profile immediately without waiting for FCM token
      await this.updateUserProfile(user.uid, { 
        lastLogin: new Date().toISOString()
      });

      // Get FCM token in background without blocking
      setTimeout(() => {
        getNotificationService().getFCMToken().then(async (pushToken) => {
          if (pushToken) {
            try {
              await this.updateUserProfile(user.uid, { pushToken });
            } catch (error) {
              console.error('AuthService: Failed to update push token:', error);
            }
          }
        }).catch(console.error);
      }, 500);

      return user;
    } catch (error) {
      console.error('AuthService: Sign in failed:', error);
      throw error;
    }
  }

  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (error) {
      console.error('AuthService: Password reset failed:', error);
      throw error;
    }
  }

  // Google Sign-In - Updated for Expo compatibility
  async signInWithGoogle() {
    try {
      // TODO: Implement Google Sign-In using expo-auth-session
      // This will be implemented when setting up Google OAuth in Expo
      throw new Error('Google Sign-In not yet implemented. Please use email/password or anonymous sign-in for now.');
      
      // The implementation will use expo-auth-session with Google provider
      // and then create Firebase credentials from the OAuth response
    } catch (error) {
      console.error('AuthService: Google sign in failed:', error);
      throw error;
    }
  }

  // Apple Sign-In
  async signInWithApple() {
    try {
      const userCredential = await signInWithCredential(auth, appleProvider);
      const user = userCredential.user;
      
      // Check if user profile exists, create if not
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const username = user.displayName?.split(' ')[0] || `Player${Math.floor(Math.random() * 10000)}`;
        await this.createUserProfile(user.uid, {
          username,
          displayName: user.displayName || username,
          photoURL: user.photoURL || null,
          pushToken: null, // Will be updated later
          email: user.email,
          authMethod: 'apple',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        });
      } else {
        // Update existing profile with login time
        await this.updateUserProfile(user.uid, { 
          lastLogin: new Date().toISOString()
        });
      }

      // Get FCM token in background without blocking
      setTimeout(() => {
        getNotificationService().getFCMToken().then(async (pushToken) => {
          if (pushToken) {
            try {
              await this.updateUserProfile(user.uid, { pushToken });
            } catch (error) {
              console.error('AuthService: Failed to update push token:', error);
            }
          }
        }).catch(console.error);
      }, 500);
      
      return user;
    } catch (error) {
      console.error('AuthService: Apple sign in failed:', error);
      throw error;
    }
  }

  // Anonymous Authentication (for Solo mode)
  async signInAnonymously() {
    try {
      const userCredential = await signInAnonymously(auth);
      const user = userCredential.user;
      
      // Create user profile immediately without waiting for FCM token
      const username = `Player${Math.floor(Math.random() * 10000)}`;
      await this.createUserProfile(user.uid, {
        username,
        displayName: username,
        photoURL: null,
        pushToken: null, // Will be updated later
        email: null,
        authMethod: 'anonymous',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });
      
      // Get FCM token in background without blocking
      setTimeout(() => {
        getNotificationService().getFCMToken().then(async (pushToken) => {
          if (pushToken) {
            try {
              await this.updateUserProfile(user.uid, { pushToken });
            } catch (error) {
              console.error('AuthService: Failed to update push token:', error);
            }
          }
        }).catch(console.error);
      }, 500); // Delay to ensure authentication completes first
      
      return user;
    } catch (error) {
      console.error('AuthService: Anonymous sign in failed:', error);
      throw error;
    }
  }

  // Sign Out
  async signOut() {
    try {
      await signOut(auth);
      return true;
    } catch (error) {
      console.error('AuthService: Sign out failed:', error);
      throw error;
    }
  }

  // User Profile Management
  async createUserProfile(uid, userData) {
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        ...userData
      });
      console.log('AuthService: User profile created successfully');
    } catch (error) {
      console.error('AuthService: Failed to create user profile:', error);
      throw error;
    }
  }

  async updateUserProfile(uid, updates) {
    try {
      await updateDoc(doc(db, 'users', uid), updates);
      console.log('AuthService: User profile updated successfully');
    } catch (error) {
      console.error('AuthService: Failed to update user profile:', error);
      throw error;
    }
  }

  async getUserProfile(uid) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return { uid, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('AuthService: Failed to get user profile:', error);
      throw error;
    }
  }

  // Update user's push token
  async updateUserPushToken(uid, pushToken) {
    try {
      await this.updateUserProfile(uid, { 
        pushToken,
        lastTokenUpdate: new Date().toISOString()
      });
      console.log('AuthService: Push token updated successfully');
    } catch (error) {
      console.error('AuthService: Failed to update push token:', error);
      throw error;
    }
  }

  // Username validation
  async isUsernameTaken(username) {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error('AuthService: Failed to check username:', error);
      return false;
    }
  }

  // Auth State Management
  onAuthStateChanged(callback) {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.currentUser = user;
        // Update FCM token in background without blocking
        setTimeout(() => {
          getNotificationService().getFCMToken().then(async (pushToken) => {
            if (pushToken) {
              try {
                await this.updateUserPushToken(user.uid, pushToken);
              } catch (error) {
                console.error('AuthService: Failed to update push token on auth state change:', error);
              }
            }
          }).catch(console.error);
        }, 1000); // Longer delay for auth state changes
      } else {
        this.currentUser = null;
      }
      callback(user);
    });
    
    this.authStateListeners.push(unsubscribe);
    return unsubscribe;
  }

  // Cleanup
  cleanup() {
    this.authStateListeners.forEach(unsubscribe => unsubscribe());
    this.authStateListeners = [];
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }
}

export default new AuthService();
