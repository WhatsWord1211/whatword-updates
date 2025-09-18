import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Check if a username is available (not taken by another user)
 * @param {string} username - The username to check
 * @param {string} currentUserId - The current user's ID (to exclude them from the check)
 * @returns {Promise<{isAvailable: boolean, error?: string}>}
 */
export const checkUsernameAvailability = async (username, currentUserId = null) => {
  try {
    if (!username || !username.trim()) {
      return { isAvailable: false, error: 'Username cannot be empty' };
    }

    const trimmedUsername = username.trim();
    
    // Basic validation
    if (trimmedUsername.length < 3) {
      return { isAvailable: false, error: 'Username must be at least 3 characters long' };
    }
    
    if (trimmedUsername.length > 20) {
      return { isAvailable: false, error: 'Username must be 20 characters or less' };
    }
    
    // Check for invalid characters (alphanumeric and underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return { isAvailable: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    
    // Check if username starts with a number
    if (/^[0-9]/.test(trimmedUsername)) {
      return { isAvailable: false, error: 'Username cannot start with a number' };
    }

    // Query Firestore to check if username exists
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', '==', trimmedUsername));
    const querySnapshot = await getDocs(q);
    
    // Check if any user (other than current user) has this username
    let usernameExists = false;
    querySnapshot.forEach((doc) => {
      // If we're checking for a current user, exclude their own document
      if (!currentUserId || doc.id !== currentUserId) {
        usernameExists = true;
      }
    });
    
    if (usernameExists) {
      return { isAvailable: false, error: 'Username is already taken' };
    }
    
    return { isAvailable: true };
  } catch (error) {
    console.error('Username validation error:', error);
    return { isAvailable: false, error: 'Failed to check username availability' };
  }
};

/**
 * Validate username format without checking availability
 * @param {string} username - The username to validate
 * @returns {Object} Validation result
 */
export const validateUsernameFormat = (username) => {
  if (!username || !username.trim()) {
    return { isValid: false, error: 'Username cannot be empty' };
  }

  const trimmedUsername = username.trim();
  
  if (trimmedUsername.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' };
  }
  
  if (trimmedUsername.length > 20) {
    return { isValid: false, error: 'Username must be 20 characters or less' };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  
  if (/^[0-9]/.test(trimmedUsername)) {
    return { isValid: false, error: 'Username cannot start with a number' };
  }
  
  return { isValid: true };
};

