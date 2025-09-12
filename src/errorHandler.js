// Comprehensive error handling utility
import logger from './logger';

// Error types for better categorization
export const ERROR_TYPES = {
  NETWORK: 'NETWORK_ERROR',
  FIREBASE: 'FIREBASE_ERROR',
  AUTH: 'AUTH_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  PERMISSION: 'PERMISSION_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

class ErrorHandler {
  constructor() {
    this.errorCounts = new Map();
    this.maxErrorsPerMinute = 10;
    this.errorWindow = 60000; // 1 minute
  }

  // Main error handling method
  handleError(error, context = '', options = {}) {
    const {
      type = ERROR_TYPES.UNKNOWN,
      severity = ERROR_SEVERITY.MEDIUM,
      showToUser = true,
      retryable = false,
      fallback = null
    } = options;

    // Rate limiting
    if (this.shouldRateLimit(error)) {
      logger.warn('Error rate limited, suppressing error');
      return fallback;
    }

    // Log the error
    this.logError(error, context, type, severity);

    // Handle based on severity
    switch (severity) {
      case ERROR_SEVERITY.CRITICAL:
        this.handleCriticalError(error, context);
        break;
      case ERROR_SEVERITY.HIGH:
        this.handleHighSeverityError(error, context, showToUser);
        break;
      case ERROR_SEVERITY.MEDIUM:
        this.handleMediumSeverityError(error, context, showToUser);
        break;
      case ERROR_SEVERITY.LOW:
        this.handleLowSeverityError(error, context);
        break;
    }

    return fallback;
  }

  // Rate limiting to prevent error spam
  shouldRateLimit(error) {
    const now = Date.now();
    const errorKey = `${error.message || 'unknown'}_${context}`;
    const errorData = this.errorCounts.get(errorKey) || { count: 0, firstSeen: now };
    
    if (now - errorData.firstSeen > this.errorWindow) {
      this.errorCounts.set(errorKey, { count: 1, firstSeen: now });
      return false;
    }
    
    errorData.count++;
    this.errorCounts.set(errorKey, errorData);
    
    return errorData.count > this.maxErrorsPerMinute;
  }

  // Log error with proper formatting
  logError(error, context, type, severity) {
    const errorInfo = {
      message: error.message || 'Unknown error',
      code: error.code || 'NO_CODE',
      type,
      severity,
      context,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };

    logger.error(`[${type}] ${error.message}`, errorInfo);
  }

  // Handle critical errors (app-breaking)
  handleCriticalError(error, context) {
    logger.error('CRITICAL ERROR - App may be unstable', { error, context });
    // In a real app, you might want to crash gracefully or show a recovery screen
  }

  // Handle high severity errors (major functionality broken)
  handleHighSeverityError(error, context, showToUser) {
    logger.error('High severity error', { error, context });
    if (showToUser) {
      // Show user-friendly error message
      this.showUserError('Something went wrong. Please try again.');
    }
  }

  // Handle medium severity errors (some functionality affected)
  handleMediumSeverityError(error, context, showToUser) {
    logger.warn('Medium severity error', { error, context });
    if (showToUser) {
      this.showUserError('There was a problem. Some features may not work properly.');
    }
  }

  // Handle low severity errors (minor issues)
  handleLowSeverityError(error, context) {
    }

  // Show user-friendly error message
  showUserError(message) {
    // This would typically show a toast or alert
    // For now, we'll just log it
    logger.info('User error message:', message);
  }

  // Wrapper for async operations with error handling
  async withErrorHandling(asyncFn, context = '', options = {}) {
    try {
      return await asyncFn();
    } catch (error) {
      return this.handleError(error, context, options);
    }
  }

  // Wrapper for Firebase operations
  async withFirebaseErrorHandling(firebaseOperation, context = '', options = {}) {
    return this.withErrorHandling(firebaseOperation, context, {
      type: ERROR_TYPES.FIREBASE,
      ...options
    });
  }

  // Wrapper for network operations
  async withNetworkErrorHandling(networkOperation, context = '', options = {}) {
    return this.withErrorHandling(networkOperation, context, {
      type: ERROR_TYPES.NETWORK,
      ...options
    });
  }

  // Wrapper for authentication operations
  async withAuthErrorHandling(authOperation, context = '', options = {}) {
    return this.withErrorHandling(authOperation, context, {
      type: ERROR_TYPES.AUTH,
      ...options
    });
  }

  // Validation error helper
  createValidationError(message, field = '') {
    const error = new Error(message);
    error.type = ERROR_TYPES.VALIDATION;
    error.field = field;
    return error;
  }

  // Permission error helper
  createPermissionError(message, permission = '') {
    const error = new Error(message);
    error.type = ERROR_TYPES.PERMISSION;
    error.permission = permission;
    return error;
  }

  // Clear error counts (useful for testing)
  clearErrorCounts() {
    this.errorCounts.clear();
  }
}

// Export singleton instance
export default new ErrorHandler();

// Export convenience functions
export const handleError = (error, context, options) => 
  new ErrorHandler().handleError(error, context, options);

export const withErrorHandling = (asyncFn, context, options) => 
  new ErrorHandler().withErrorHandling(asyncFn, context, options);

export const withFirebaseErrorHandling = (firebaseOperation, context, options) => 
  new ErrorHandler().withFirebaseErrorHandling(firebaseOperation, context, options);

export const withNetworkErrorHandling = (networkOperation, context, options) => 
  new ErrorHandler().withNetworkErrorHandling(networkOperation, context, options);

export const withAuthErrorHandling = (authOperation, context, options) => 
  new ErrorHandler().withAuthErrorHandling(authOperation, context, options);
