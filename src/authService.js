import { auth } from './firebase';
import { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

class AuthService {
  constructor() {
    this.currentUser = null;
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  getCurrentUser() {
    return this.currentUser || auth.currentUser;
  }

  async signInWithEmail(email, password) {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      this.setCurrentUser(result.user);
      return result.user;
    } catch (error) {
      console.error('AuthService: Email sign in failed:', error);
      throw error;
    }
  }

  async createUserWithEmail(email, password) {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      this.setCurrentUser(result.user);
      return result.user;
    } catch (error) {
      console.error('AuthService: User creation failed:', error);
      throw error;
    }
  }

  async signOut() {
    try {
      // Sign out from Firebase
      await signOut(auth);
      this.setCurrentUser(null);
    } catch (error) {
      console.error('AuthService: Sign out failed:', error);
      throw error;
    }
  }

  isAuthenticated() {
    return !!this.getCurrentUser();
  }
}

export default new AuthService();
