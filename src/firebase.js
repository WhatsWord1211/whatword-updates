import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence, OAuthProvider } from 'firebase/auth';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyC1pxEdLS7La9HOq7AnIlIFMpYCfNbp0cY",
  authDomain: "whatword-a3f4b.firebaseapp.com",
  projectId: "whatword-a3f4b",
  storageBucket: "whatword-a3f4b.firebasestorage.app",
  messagingSenderId: "1052433400571",
  appId: "1:1052433400571:android:44c66d29f40cb480d9265e",
  measurementId: "G-XXXXXXXXXX" // You'll need to add this if you enable Google Analytics
};

// Initialize Firebase app
let app;
try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
} catch (error) {
  console.error('Firebase app initialization error:', error);
  throw error;
}

// Initialize Auth with proper error handling
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (error) {
  console.error('Firebase auth initialization error:', error);
  // Fallback to default auth if persistence fails
  try {
    const { getAuth } = require('firebase/auth');
    auth = getAuth(app);
  } catch (fallbackError) {
    console.error('Firebase auth fallback failed:', fallbackError);
    throw fallbackError;
  }
}

// Initialize other services with error handling
let db, messaging;
try {
  db = getFirestore(app);
  messaging = getMessaging(app);
} catch (error) {
  console.error('Firebase service initialization error:', error);
}

// Apple Sign-In provider
let appleProvider;
try {
  appleProvider = new OAuthProvider('apple.com');
  appleProvider.addScope('email');
  appleProvider.addScope('name');
} catch (error) {
  console.error('Apple provider initialization error:', error);
  appleProvider = null;
}

// Request notification permission and get FCM token
const requestNotificationPermission = async () => {
  try {
    if (!messaging) {
      console.warn('Messaging not initialized');
      return null;
    }
    
    // For React Native, we'll skip permission request for now
    // and just try to get the token
    const token = await getToken(messaging, {
      vapidKey: 'BN_CPeFYRM3c6IuuBz-l8xdJGiN2C8G5vb9rdH8f20apmzFz5_PcTOB3A11FfZ8lzYOezFR_llCNGFQj1_ycg8E'
    });
    return token;
  } catch (error) {
    console.error('Failed to get FCM token:', error);
    return null;
  }
};

// Handle foreground messages
const onMessageReceived = (callback) => {
  try {
    if (!messaging) {
      console.warn('Messaging not initialized');
      return () => {};
    }
    return onMessage(messaging, callback);
  } catch (error) {
    console.error('Failed to set up message handler:', error);
    return () => {};
  }
};

export { auth, db, messaging, appleProvider, requestNotificationPermission, onMessageReceived };