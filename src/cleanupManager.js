// Cleanup manager for timeouts, intervals, and listeners
import React from 'react';
import logger from './logger';

class CleanupManager {
  constructor() {
    this.timeouts = new Set();
    this.intervals = new Set();
    this.listeners = new Set();
    this.isDestroyed = false;
  }

  // Add timeout and return cleanup function
  addTimeout(callback, delay, ...args) {
    if (this.isDestroyed) {
      logger.warn('CleanupManager: Attempted to add timeout after destruction');
      return () => {};
    }

    const timeoutId = setTimeout(() => {
      this.timeouts.delete(timeoutId);
      callback(...args);
    }, delay);
    
    this.timeouts.add(timeoutId);
    
    return () => {
      this.removeTimeout(timeoutId);
    };
  }

  // Add interval and return cleanup function
  addInterval(callback, delay, ...args) {
    if (this.isDestroyed) {
      logger.warn('CleanupManager: Attempted to add interval after destruction');
      return () => {};
    }

    const intervalId = setInterval(callback, delay, ...args);
    this.intervals.add(intervalId);
    
    return () => {
      this.removeInterval(intervalId);
    };
  }

  // Add listener and return cleanup function
  addListener(unsubscribeFunction) {
    if (this.isDestroyed) {
      logger.warn('CleanupManager: Attempted to add listener after destruction');
      return () => {};
    }

    this.listeners.add(unsubscribeFunction);
    
    return () => {
      this.removeListener(unsubscribeFunction);
    };
  }

  // Remove specific timeout
  removeTimeout(timeoutId) {
    if (this.timeouts.has(timeoutId)) {
      clearTimeout(timeoutId);
      this.timeouts.delete(timeoutId);
    }
  }

  // Remove specific interval
  removeInterval(intervalId) {
    if (this.intervals.has(intervalId)) {
      clearInterval(intervalId);
      this.intervals.delete(intervalId);
    }
  }

  // Remove specific listener
  removeListener(unsubscribeFunction) {
    if (this.listeners.has(unsubscribeFunction)) {
      try {
        unsubscribeFunction();
      } catch (error) {
        logger.error('CleanupManager: Error removing listener', error);
      }
      this.listeners.delete(unsubscribeFunction);
    }
  }

  // Clear all timeouts
  clearTimeouts() {
    this.timeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.timeouts.clear();
  }

  // Clear all intervals
  clearIntervals() {
    this.intervals.forEach(intervalId => {
      clearInterval(intervalId);
    });
    this.intervals.clear();
  }

  // Clear all listeners
  clearListeners() {
    this.listeners.forEach(unsubscribeFunction => {
      try {
        unsubscribeFunction();
      } catch (error) {
        logger.error('CleanupManager: Error clearing listener', error);
      }
    });
    this.listeners.clear();
  }

  // Clear everything
  clearAll() {
    this.clearTimeouts();
    this.clearIntervals();
    this.clearListeners();
  }

  // Destroy the manager (prevents new additions)
  destroy() {
    this.isDestroyed = true;
    this.clearAll();
  }

  // Get cleanup stats
  getStats() {
    return {
      timeouts: this.timeouts.size,
      intervals: this.intervals.size,
      listeners: this.listeners.size,
      isDestroyed: this.isDestroyed
    };
  }
}

// Hook for React components
export const useCleanupManager = () => {
  const cleanupManager = new CleanupManager();
  
  // Auto-cleanup on unmount
  React.useEffect(() => {
    return () => {
      cleanupManager.destroy();
    };
  }, []);

  return cleanupManager;
};

// Utility function to create a cleanup manager
export const createCleanupManager = () => new CleanupManager();

export default CleanupManager;
