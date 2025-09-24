/**
 * Simple profanity filter for usernames and display names
 * This is a basic implementation - in production, you'd want a more comprehensive solution
 */

// Basic list of inappropriate words (this should be expanded and possibly loaded from a secure source)
const PROFANITY_LIST = [
  // Add your list of inappropriate words here
  'damn', 'hell', 'crap', 'stupid', 'idiot', 'moron', 'dumb',
  // Note: This is a minimal example. In production, use a comprehensive profanity library
];

// Additional patterns to check for
const INAPPROPRIATE_PATTERNS = [
  /f+u+c+k+/i,  // f-word variations
  /s+h+i+t+/i,  // s-word variations
  /b+i+t+c+h+/i, // b-word variations
  /a+s+s+h+o+l+e+/i, // a-word variations
  /d+i+c+k+/i,  // d-word variations
  /p+i+s+s+/i,  // p-word variations
  /w+h+o+r+e+/i, // w-word variations
  /c+u+n+t+/i,  // c-word variations
  /n+i+g+g+a+/i, // n-word variations
];

/**
 * Check if text contains profanity
 * @param {string} text - Text to check
 * @returns {Object} - {isClean: boolean, reason?: string}
 */
export const checkProfanity = (text) => {
  if (!text || typeof text !== 'string') {
    return { isClean: true };
  }

  const normalizedText = text.toLowerCase().trim();

  // Check against profanity list
  for (const word of PROFANITY_LIST) {
    if (normalizedText.includes(word.toLowerCase())) {
      return { 
        isClean: false, 
        reason: `Username contains inappropriate language. Please choose a different username.` 
      };
    }
  }

  // Check against patterns
  for (const pattern of INAPPROPRIATE_PATTERNS) {
    if (pattern.test(normalizedText)) {
      return { 
        isClean: false, 
        reason: `Username contains inappropriate language. Please choose a different username.` 
      };
    }
  }

  // Check for excessive repetition (spam-like behavior)
  const repeatedChars = /(.)\1{4,}/; // Same character repeated 5+ times
  if (repeatedChars.test(normalizedText)) {
    return { 
      isClean: false, 
      reason: `Username contains excessive repetition. Please choose a different username.` 
    };
  }

  // Check for numbers that might represent inappropriate words
  const numberSubstitutions = /[0-9]/;
  if (numberSubstitutions.test(normalizedText)) {
    // This is a basic check - you might want to be more specific about number substitutions
    const suspiciousPatterns = [
      /[a-z]*[0-9][a-z]*/i, // Mixed letters and numbers might be substitutions
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(normalizedText) && normalizedText.length > 6) {
        // Only flag if it's longer than 6 chars and has mixed letters/numbers
        // This is a conservative approach to avoid false positives
        return { 
          isClean: false, 
          reason: `Username may contain inappropriate content. Please choose a different username.` 
        };
      }
    }
  }

  return { isClean: true };
};

/**
 * Validate username with profanity check
 * @param {string} username - Username to validate
 * @returns {Object} - {isValid: boolean, error?: string}
 */
export const validateUsernameContent = (username) => {
  const profanityCheck = checkProfanity(username);
  
  if (!profanityCheck.isClean) {
    return { isValid: false, error: profanityCheck.reason };
  }

  return { isValid: true };
};

/**
 * Validate display name with profanity check
 * @param {string} displayName - Display name to validate
 * @returns {Object} - {isValid: boolean, error?: string}
 */
export const validateDisplayNameContent = (displayName) => {
  const profanityCheck = checkProfanity(displayName);
  
  if (!profanityCheck.isClean) {
    return { isValid: false, error: profanityCheck.reason };
  }

  return { isValid: true };
};
