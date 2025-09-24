import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Check if a username is available (not taken by another user)
 * @param {string} username - The username to check
 * @param {string} currentUserId - The current user's ID (to exclude them from the check)
 * @param {boolean} isManualEdit - Whether this is a manual edit (true) or initial signup (false)
 * @returns {Promise<{isAvailable: boolean, error?: string}>}
 */
export const checkUsernameAvailability = async (username, currentUserId = null, isManualEdit = false) => {
  try {
    if (!username || !username.trim()) {
      return { isAvailable: false, error: 'Username cannot be empty' };
    }

    const trimmedUsername = username.trim();
    
    // Basic validation
    if (trimmedUsername.length < 3) {
      return { isAvailable: false, error: 'Username must be at least 3 characters long' };
    }
    
    // Different length limits for manual edits vs initial signup
    const maxLength = isManualEdit ? 15 : 50; // Allow longer usernames for initial signup
    if (trimmedUsername.length > maxLength) {
      return { isAvailable: false, error: `Username must be ${maxLength} characters or less` };
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
 * @param {boolean} isManualEdit - Whether this is a manual edit (true) or initial signup (false)
 * @returns {Object} Validation result
 */
export const validateUsernameFormat = (username, isManualEdit = false) => {
  if (!username || !username.trim()) {
    return { isValid: false, error: 'Username cannot be empty' };
  }

  const trimmedUsername = username.trim();
  
  if (trimmedUsername.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' };
  }
  
  // Different length limits for manual edits vs initial signup
  const maxLength = isManualEdit ? 15 : 50; // Allow longer usernames for initial signup
  if (trimmedUsername.length > maxLength) {
    return { isValid: false, error: `Username must be ${maxLength} characters or less` };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  
  if (/^[0-9]/.test(trimmedUsername)) {
    return { isValid: false, error: 'Username cannot start with a number' };
  }
  
  return { isValid: true };
};

/**
 * Generate a safe username from email prefix
 * @param {string} email - The email address
 * @returns {Promise<string>} A safe username derived from the email
 */
export const generateUsernameFromEmail = async (email) => {
  if (!email || typeof email !== 'string') {
    return await generateUniqueUsername(`Player${Math.floor(Math.random() * 10000)}`);
  }

  // Extract prefix before @
  let username = email.split('@')[0];
  
  // Remove invalid characters (keep only alphanumeric and underscores)
  username = username.replace(/[^a-zA-Z0-9_]/g, '');
  
  // If it starts with a number, add a prefix
  if (/^[0-9]/.test(username)) {
    username = 'user' + username;
  }
  
  // If it's too short, add random numbers
  if (username.length < 3) {
    username = username + Math.floor(Math.random() * 1000);
  }
  
  // If it's too long, truncate it
  if (username.length > 50) {
    username = username.substring(0, 50);
  }
  
  // If somehow it's still empty or invalid, generate a random one
  if (!username || username.length < 3) {
    username = `Player${Math.floor(Math.random() * 10000)}`;
  }
  
  // Ensure the username is unique
  return await generateUniqueUsername(username);
};

/**
 * Generate a unique username by checking for duplicates and adding numbers if needed
 * @param {string} baseUsername - The base username to make unique
 * @returns {Promise<string>} A unique username
 */
const generateUniqueUsername = async (baseUsername) => {
  let username = baseUsername;
  let counter = 1;
  let maxAttempts = 100; // Prevent infinite loops
  
  while (counter <= maxAttempts) {
    try {
      // Check if username is available
      const availability = await checkUsernameAvailability(username, null, false);
      
      if (availability.isAvailable) {
        return username;
      }
      
      // Username is taken, try with a number suffix
      username = `${baseUsername}${counter}`;
      counter++;
      
    } catch (error) {
      console.error('Error checking username availability:', error);
      // If there's an error, fall back to a random username
      return `Player${Math.floor(Math.random() * 100000)}`;
    }
  }
  
  // If we've tried 100 times, fall back to a random username
  console.warn(`Could not generate unique username after ${maxAttempts} attempts, using random fallback`);
  return `Player${Math.floor(Math.random() * 100000)}`;
};

