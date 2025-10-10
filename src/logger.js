// Production-safe logging utility
import Constants from 'expo-constants';

const isDevelopment = __DEV__ || Constants.expoConfig?.extra?.debugMode === true;
const isProduction = !isDevelopment;

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

// Current log level (can be adjusted)
const CURRENT_LOG_LEVEL = isDevelopment ? LOG_LEVELS.VERBOSE : LOG_LEVELS.ERROR;

class Logger {
  constructor() {
    this.isEnabled = isDevelopment;
    this.logLevel = CURRENT_LOG_LEVEL;
  }

  // Enable/disable logging (useful for testing)
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  // Set log level
  setLogLevel(level) {
    this.logLevel = level;
  }

  // Check if should log at given level
  shouldLog(level) {
    return this.isEnabled && level <= this.logLevel;
  }

  // Core logging methods
  error(message, ...args) {
    // ERROR logs should ALWAYS be visible, even in production
    console.error(`[ERROR] ${message}`, ...args);
  }

  warn(message, ...args) {
    // WARN logs should also be visible in production
    console.warn(`[WARN] ${message}`, ...args);
  }

  info(message, ...args) {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  debug(message, ...args) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  verbose(message, ...args) {
    if (this.shouldLog(LOG_LEVELS.VERBOSE)) {
      console.log(`[VERBOSE] ${message}`, ...args);
    }
  }

  // Convenience methods for common patterns
  logGameState(component, state, data = {}) {
    this.debug(`${component}: Game state changed`, { state, ...data });
  }

  logFirebase(operation, data = {}) {
    this.debug(`Firebase ${operation}`, data);
  }

  logUserAction(action, data = {}) {
    this.info(`User action: ${action}`, data);
  }

  logError(error, context = '') {
    this.error(`Error${context ? ` in ${context}` : ''}:`, error.message || error);
    if (isDevelopment && error.stack) {
      this.debug('Stack trace:', error.stack);
    }
  }

  // Performance logging
  time(label) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.time(`[PERF] ${label}`);
    }
  }

  timeEnd(label) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.timeEnd(`[PERF] ${label}`);
    }
  }
}

// Export singleton instance
export default new Logger();

// Export individual methods for convenience
export const { error, warn, info, debug, verbose, logGameState, logFirebase, logUserAction, logError, time, timeEnd } = new Logger();
