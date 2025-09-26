import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence, GoogleAuthProvider } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Firebase configuration - using Constants.expoConfig.extra (environment variables are loaded via app.json)
const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey || "AIzaSyBQ4ua2PKDvF_RgHYTpB79S5HArrl9lChA",
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain || "whatword-a3f4b.firebaseapp.com",
  projectId: Constants.expoConfig?.extra?.firebaseProjectId || "whatword-a3f4b",
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket || "whatword-a3f4b.firebasestorage.app",
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId || "1052433400571",
  appId: Constants.expoConfig?.extra?.firebaseAppId || "1:1052433400571:web:16122dad5c5a1344d9265e",
  measurementId: Constants.expoConfig?.extra?.firebaseMeasurementId || "G-TWN7PXQ55G"
};

// Debug logging for Firebase config
console.log('Firebase Config Debug:', {
  apiKey: firebaseConfig.apiKey ? 'Present' : 'Missing',
  authDomain: firebaseConfig.authDomain ? 'Present' : 'Missing',
  projectId: firebaseConfig.projectId ? 'Present' : 'Missing',
  appId: firebaseConfig.appId ? 'Present' : 'Missing'
});


// Initialize Firebase with error handling
let app, auth, db;

try {
  console.log('Initializing Firebase...');
  app = initializeApp(firebaseConfig);
  console.log('Firebase app initialized successfully');
  
  // Initialize Auth with AsyncStorage persistence
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
  console.log('Firebase Auth initialized successfully');
  
  // Export services
  db = getFirestore(app);
  console.log('Firebase Firestore initialized successfully');
  
} catch (error) {
  console.error('Firebase initialization failed:', error);
  console.error('Firebase config used:', firebaseConfig);
  throw error;
}

export { auth, db, app };

// Development mode debugging removed for production
