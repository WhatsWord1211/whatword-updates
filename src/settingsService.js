import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, defaultTheme } from './theme';

class SettingsService {
  constructor() {
    this.settings = null;
    this.listeners = [];
    this.defaultSettings = {
      // Theme settings
      theme: 'dark',
      
      // Audio settings
      masterVolume: 1.0,
      soundEffectsVolume: 1.0,
      musicVolume: 0.8,
      vibrationEnabled: true,
      
      // Notification settings
      pushNotifications: true,
      friendRequestNotifications: true,
      gameChallengeNotifications: true,
      achievementNotifications: true,
      reminderNotifications: false,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      
      // Gameplay settings
      maxGuesses: 25,
      hintCount: 3,
      timeLimitEnabled: false,
      timeLimit: 120, // seconds
      
      // Privacy settings
      profileVisibility: 'public', // public, friends, private
      allowFriendRequests: 'everyone', // everyone, friends, none
      allowGameChallenges: 'everyone', // everyone, friends, none
      shareStatistics: true,
      showOnLeaderboards: true,
      allowUsernameSearch: true,
      showInFriendSuggestions: true,
      
      // Cache and data settings
      autoSaveEnabled: true,
      autoSaveFrequency: 30, // seconds
      cacheSize: 100, // MB
      offlineModeEnabled: false,
      
      // Accessibility settings
      fontSize: 'medium', // small, medium, large
      highContrast: false,
      reducedMotion: false,
      screenReaderSupport: false,
    };
  }

  // Initialize settings
  async initialize() {
    try {
      const savedSettings = await AsyncStorage.getItem('gameSettings');
      if (savedSettings) {
        this.settings = { ...this.defaultSettings, ...JSON.parse(savedSettings) };
      } else {
        this.settings = { ...this.defaultSettings };
        await this.saveSettings();
      }
      return this.settings;
    } catch (error) {
      console.error('SettingsService: Failed to initialize settings:', error);
      this.settings = { ...this.defaultSettings };
      return this.settings;
    }
  }

  // Get all settings
  getSettings() {
    return this.settings || this.defaultSettings;
  }

  // Get a specific setting
  getSetting(key) {
    if (!this.settings) return this.defaultSettings[key];
    return this.settings[key];
  }

  // Update a setting
  async updateSetting(key, value) {
    try {
      if (!this.settings) await this.initialize();
      
      this.settings[key] = value;
      await this.saveSettings();
      
      // Notify listeners
      this.notifyListeners(key, value);
      
      return true;
    } catch (error) {
      console.error('SettingsService: Failed to update setting:', error);
      return false;
    }
  }

  // Update multiple settings at once
  async updateSettings(updates) {
    try {
      if (!this.settings) await this.initialize();
      
      Object.assign(this.settings, updates);
      await this.saveSettings();
      
      // Notify listeners for each updated setting
      Object.entries(updates).forEach(([key, value]) => {
        this.notifyListeners(key, value);
      });
      
      return true;
    } catch (error) {
      console.error('SettingsService: Failed to update settings:', error);
      return false;
    }
  }

  // Save settings to AsyncStorage
  async saveSettings() {
    try {
      await AsyncStorage.setItem('gameSettings', JSON.stringify(this.settings));
      return true;
    } catch (error) {
      console.error('SettingsService: Failed to save settings:', error);
      return false;
    }
  }

  // Reset settings to defaults
  async resetSettings() {
    try {
      this.settings = { ...this.defaultSettings };
      await this.saveSettings();
      
      // Notify listeners of reset
      this.notifyListeners('reset', this.settings);
      
      return true;
    } catch (error) {
      console.error('SettingsService: Failed to reset settings:', error);
      return false;
    }
  }

  // Reset specific category of settings
  async resetCategory(category) {
    try {
      const categoryDefaults = this.getCategoryDefaults(category);
      if (categoryDefaults) {
        Object.assign(this.settings, categoryDefaults);
        await this.saveSettings();
        
        // Notify listeners
        Object.entries(categoryDefaults).forEach(([key, value]) => {
          this.notifyListeners(key, value);
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('SettingsService: Failed to reset category:', error);
      return false;
    }
  }

  // Get category defaults
  getCategoryDefaults(category) {
    const categoryMap = {
      theme: ['theme'],
      audio: ['masterVolume', 'soundEffectsVolume', 'musicVolume', 'vibrationEnabled'],
      notifications: [
        'pushNotifications', 'friendRequestNotifications', 'gameChallengeNotifications',
        'achievementNotifications', 'reminderNotifications', 'quietHoursEnabled',
        'quietHoursStart', 'quietHoursEnd'
      ],
      gameplay: ['maxGuesses', 'hintCount', 'timeLimitEnabled', 'timeLimit'],
      privacy: ['profileVisibility', 'allowFriendRequests', 'allowGameChallenges', 'shareStatistics', 'showOnLeaderboards', 'allowUsernameSearch', 'showInFriendSuggestions'],
      cache: ['autoSaveEnabled', 'autoSaveFrequency', 'cacheSize', 'offlineModeEnabled'],
      accessibility: ['fontSize', 'highContrast', 'reducedMotion', 'screenReaderSupport']
    };
    
    const keys = categoryMap[category];
    if (!keys) return null;
    
    const defaults = {};
    keys.forEach(key => {
      defaults[key] = this.defaultSettings[key];
    });
    
    return defaults;
  }

  // Cache management
  async getCacheSize() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      let totalSize = 0;
      
      // Define cache-related keys that should be included in size calculation
      const cacheKeys = [
        'savedGames', 'leaderboard', 'earnedBadges', 'dismissedNotifications', 
        'notificationsSeen', 'hasLaunched', 'gameSettings', 'offlineWordLists'
      ];
      
      for (const key of keys) {
        if (cacheKeys.includes(key) || key.startsWith('game_') || key.startsWith('cache_') || key.startsWith('temp_')) {
          const value = await AsyncStorage.getItem(key);
          if (value) {
            // Use string length as a rough approximation of size
            // This is more reliable than Blob in React Native
            totalSize += value.length;
          }
        }
      }
      
      // Convert bytes to MB and round to 2 decimal places
      const sizeInMB = totalSize / (1024 * 1024);
      const roundedSize = Math.round(sizeInMB * 100) / 100;
      
      
      return roundedSize;
    } catch (error) {
      console.error('SettingsService: Failed to get cache size:', error);
      return 0;
    }
  }

  async clearCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      // Define all cache-related keys that should be cleared
      const cacheKeys = keys.filter(key => 
        key.startsWith('game_') || key.startsWith('cache_') || key.startsWith('temp_') ||
        key === 'savedGames' || key === 'leaderboard' || key === 'earnedBadges' ||
        key === 'dismissedNotifications' || key === 'notificationsSeen' || 
        key === 'offlineWordLists'
      );
      
      await AsyncStorage.multiRemove(cacheKeys);
      
      // Notify listeners
      this.notifyListeners('cacheCleared', true);
      
      return true;
    } catch (error) {
      console.error('SettingsService: Failed to clear cache:', error);
      return false;
    }
  }

  async clearGameData() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const gameKeys = keys.filter(key => 
        key.startsWith('game_') || key.startsWith('solo_') || key.startsWith('pvp_')
      );
      
      await AsyncStorage.multiRemove(gameKeys);
      
      // Notify listeners
      this.notifyListeners('gameDataCleared', true);
      
      return true;
    } catch (error) {
      console.error('SettingsService: Failed to clear game data:', error);
      return false;
    }
  }

  // Check if offline mode is available
  async checkOfflineModeAvailability() {
    try {
      const offlineData = await AsyncStorage.getItem('offlineWordLists');
      const hasOfflineWords = offlineData && JSON.parse(offlineData).length > 0;
      
      return {
        available: hasOfflineWords,
        wordCount: hasOfflineWords ? JSON.parse(offlineData).length : 0
      };
    } catch (error) {
      console.error('SettingsService: Failed to check offline mode:', error);
      return { available: false, wordCount: 0 };
    }
  }

  // Add listener for setting changes
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners
  notifyListeners(key, value) {
    this.listeners.forEach(callback => {
      try {
        callback(key, value, this.settings);
      } catch (error) {
        console.error('SettingsService: Listener error:', error);
      }
    });
  }

  // Get theme colors
  getThemeColors() {
    const themeName = this.getSetting('theme');
    return themes[themeName] || themes[defaultTheme];
  }

  // Check if quiet hours are active
  isQuietHours() {
    if (!this.getSetting('quietHoursEnabled')) return false;
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = this.getSetting('quietHoursStart').split(':').map(Number);
    const [endHour, endMin] = this.getSetting('quietHoursEnd').split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (startMinutes <= endMinutes) {
      // Same day (e.g., 9 AM to 5 PM)
      return currentTime >= startMinutes && currentTime <= endMinutes;
    } else {
      // Overnight (e.g., 10 PM to 8 AM)
      return currentTime >= startMinutes || currentTime <= endMinutes;
    }
  }

  // Validate setting value
  validateSetting(key, value) {
    const validators = {
      theme: (val) => ['dark', 'light'].includes(val),
      masterVolume: (val) => val >= 0 && val <= 1,
      soundEffectsVolume: (val) => val >= 0 && val <= 1,
      musicVolume: (val) => val >= 0 && val <= 1,
      maxGuesses: (val) => val >= 10 && val <= 50,
      hintCount: (val) => val >= 0 && val <= 5,
      timeLimit: (val) => val >= 30 && val <= 600,
      fontSize: (val) => ['small', 'medium', 'large'].includes(val),
      profileVisibility: (val) => ['public', 'friends', 'private'].includes(val),
      allowFriendRequests: (val) => ['everyone', 'friends', 'none'].includes(val),
      allowGameChallenges: (val) => ['everyone', 'friends', 'none'].includes(val),
      showOnLeaderboards: (val) => typeof val === 'boolean',
      allowUsernameSearch: (val) => typeof val === 'boolean',
      showInFriendSuggestions: (val) => typeof val === 'boolean',
    };
    
    const validator = validators[key];
    return validator ? validator(value) : true;
  }
}

export default new SettingsService();
