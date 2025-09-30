import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration - hardcoded for development (will use EAS env vars in production)
const firebaseConfig = {
  apiKey: "AIzaSyBQ4ua2PKDvF_RgHYTpB79S5HArrl9lChA",
  authDomain: "whatword-a3f4b.firebaseapp.com",
  projectId: "whatword-a3f4b",
  storageBucket: "whatword-a3f4b.firebasestorage.app",
  messagingSenderId: "1052433400571",
  appId: "1:1052433400571:web:16122dad5c5a1344d9265e",
  measurementId: "G-TWN7PXQ55G"
};

// Initialize Firebase with AsyncStorage persistence
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence to fix the warning
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

const db = getFirestore(app);

export { auth, db, app };

// Development mode debugging removed for production
