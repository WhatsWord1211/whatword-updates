import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence, GoogleAuthProvider } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Firebase configuration from app.json extra section
const firebaseConfig = {
  apiKey: Constants.expoConfig.extra.firebaseApiKey,
  authDomain: Constants.expoConfig.extra.firebaseAuthDomain,
  projectId: Constants.expoConfig.extra.firebaseProjectId,
  storageBucket: Constants.expoConfig.extra.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig.extra.firebaseMessagingSenderId,
  appId: Constants.expoConfig.extra.firebaseAppId,
  measurementId: Constants.expoConfig.extra.firebaseMeasurementId
};

console.log('Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  apiKey: firebaseConfig.apiKey ? '***' : 'MISSING'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Export services
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export { app };

// Add debugging for dev mode
if (__DEV__) {
  console.log('🔧 DEV MODE: Firebase initialized with AsyncStorage persistence');
  console.log('🔧 DEV MODE: Auth instance:', auth);
  console.log('🔧 DEV MODE: Firestore instance:', db);
  
  // Check if we can connect to Firebase
  auth.onAuthStateChanged((user) => {
    console.log('🔧 DEV MODE: Auth state changed:', user ? 'User logged in' : 'No user');
  });
}
