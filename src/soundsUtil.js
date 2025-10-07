import { Audio } from 'expo-av';
import { Platform, AppState } from 'react-native';
import settingsService from './settingsService';

const soundFiles = {
  feedbackDot: require('../assets/sounds/feedbackDot.mp3'),
  rank: require('../assets/sounds/rank.mp3'),
  backspace: require('../assets/sounds/backspace.mp3'),
  guess: require('../assets/sounds/guess.mp3'),
  invalidWord: require('../assets/sounds/invalid-word-guess.mp3'),
  letterInput: require('../assets/sounds/letter-input.mp3'),
  chime: require('../assets/sounds/chime.mp3'),
  startGame: require('../assets/sounds/let-the-games-begin.mp3'),
  tie: require('../assets/sounds/tie.mp3'),
  toggleLetter: require('../assets/sounds/toggle-letter.mp3'),
  toggleLetterSecond: require('../assets/sounds/toggle-letter-second.mp3'),
  victory: require('../assets/sounds/victory.mp3'),
  lose: require('../assets/sounds/you-lost.mp3'),
  congratulations: require('../assets/sounds/congratulations.mp3'),
  hint: require('../assets/sounds/hint.mp3'),
  opponentSolved: require('../assets/sounds/opponentSolved.mp3'),
  maxGuesses: require('../assets/sounds/maxGuesses.mp3'),
  customTab: require('../assets/sounds/custom-tab.mp3'),
  toggleTab: require('../assets/sounds/toggle-tab.mp3'),
};

// Preloaded sounds for better performance
const loadedSounds = {};
let soundsLoaded = false;
let audioConfigured = false;
let appStateSubscription = null;
let soundValidationInterval = null;

/**
 * Configure audio mode for iOS and Android
 * Industry standard: Respect system silent mode and use proper audio category
 */
const configureAudio = async () => {
  if (audioConfigured) return;
  
  try {
    console.log('soundsUtil: Configuring audio mode...');
    
    // iOS-specific: Add delay before audio configuration
    if (Platform.OS === 'ios') {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Industry standard audio configuration
    await Audio.setAudioModeAsync({
      // iOS: Respect silent/ring switch
      playsInSilentModeIOS: false,  // CRITICAL: false = respects silent switch
      
      // Allow recording while playing (for voice messages, etc.)
      allowsRecordingIOS: false,
      
      // Use ambient audio category - plays nicely with other apps
      staysActiveInBackground: false,
      
      // iOS: Don't interrupt other audio (music, podcasts)
      // Using numeric value for compatibility: 1 = DoNotMix
      interruptionModeIOS: 1,
      
      // Android: Use STREAM_MUSIC for volume buttons
      // Using numeric value for compatibility: 1 = DoNotMix
      interruptionModeAndroid: 1,
      
      // iOS: Duck other audio when playing sounds
      shouldDuckAndroid: true,
      
      // Android: Route to earpiece if needed
      playThroughEarpieceAndroid: false,
    });
    
    audioConfigured = true;
    console.log('soundsUtil: Audio mode configured (respects iOS silent mode)');
  } catch (error) {
    console.error('soundsUtil: Failed to configure audio mode:', error);
  }
};

/**
 * Load all sounds on app start
 * Industry standard: Preload sounds for instant playback
 */
export const loadSounds = async () => {
  if (soundsLoaded) return;
  
  try {
    console.log('soundsUtil: Loading sounds...');
    
    // Configure audio first
    await configureAudio();
    
    // Load sounds with better error handling
    const soundPromises = Object.entries(soundFiles).map(async ([key, soundFile]) => {
      try {
        const { sound } = await Audio.Sound.createAsync(soundFile);
        loadedSounds[key] = sound;
        console.log(`soundsUtil: Loaded sound ${key}`);
      } catch (error) {
        console.warn(`soundsUtil: Failed to load sound ${key}:`, error.message);
        // Don't fail the entire loading process for individual sounds
      }
    });

    await Promise.allSettled(soundPromises);
    soundsLoaded = true;
    
    // Set up AppState monitoring and sound validation
    setupAppStateMonitoring();
    startSoundValidation();
    
    console.log('soundsUtil: Sound loading completed');
  } catch (error) {
    console.error('soundsUtil: Failed to load sounds', error);
    // Still mark as loaded to prevent infinite retries
    soundsLoaded = true;
  }
};

/**
 * Check if sounds are ready
 */
export const areSoundsReady = () => soundsLoaded;

/**
 * Reload a specific sound that has become invalid
 */
const reloadSound = async (key) => {
  try {
    const soundFile = soundFiles[key];
    if (!soundFile) {
      console.warn(`soundsUtil: Sound file not found for key ${key}`);
      return;
    }

    // Unload the old sound if it exists
    const oldSound = loadedSounds[key];
    if (oldSound && typeof oldSound.unloadAsync === 'function') {
      try {
        await oldSound.unloadAsync();
      } catch (error) {
        console.warn(`soundsUtil: Error unloading old sound ${key}:`, error.message);
      }
    }

    // Load the new sound
    const { sound } = await Audio.Sound.createAsync(soundFile);
    loadedSounds[key] = sound;
    console.log(`soundsUtil: Successfully reloaded sound ${key}`);
  } catch (error) {
    console.error(`soundsUtil: Failed to reload sound ${key}:`, error.message);
    throw error;
  }
};

/**
 * Get effective volume based on user settings
 * Industry standard: Master volume * sound effects volume
 */
const getEffectiveVolume = (options = {}) => {
  try {
    const settings = settingsService.getSettings();
    
    // Check if sound effects are enabled
    if (settings.soundEffectsVolume === 0) {
      return 0; // Muted
    }
    
    // Calculate effective volume: master * soundEffects * custom
    const masterVolume = settings.masterVolume || 1.0;
    const soundEffectsVolume = settings.soundEffectsVolume || 1.0;
    const customVolume = options.volume !== undefined ? options.volume : 1.0;
    
    return masterVolume * soundEffectsVolume * customVolume;
  } catch (error) {
    console.warn('soundsUtil: Failed to get volume settings, using default');
    return options.volume !== undefined ? options.volume : 1.0;
  }
};

/**
 * Play a preloaded sound
 * Industry standard: Check settings, respect silent mode, apply volume
 */
export const playSound = async (key, options = {}) => {
  try {
    // Wait for sounds to be loaded if they're not ready yet
    if (!soundsLoaded) {
      await loadSounds();
    }
    
    // Configure audio if not done yet
    if (!audioConfigured) {
      await configureAudio();
    }


    const sound = loadedSounds[key];
    if (!sound) {
      console.warn(`soundsUtil: Sound ${key} not loaded, skipping play`);
      return;
    }

    // Get effective volume based on user settings
    const effectiveVolume = getEffectiveVolume(options);
    
    // Don't play if volume is 0 (user muted)
    if (effectiveVolume === 0) {
      console.log(`soundsUtil: Sound ${key} muted by user settings`);
      return;
    }

    // Check if sound is still valid before playing
    try {
      // Validate sound object is still functional
      if (!sound || typeof sound.setVolumeAsync !== 'function' || typeof sound.replayAsync !== 'function') {
        console.warn(`soundsUtil: Sound ${key} object is invalid, reloading...`);
        await reloadSound(key);
        // Retry with the newly loaded sound
        const reloadedSound = loadedSounds[key];
        if (reloadedSound) {
          await reloadedSound.setVolumeAsync(effectiveVolume);
          await reloadedSound.replayAsync();
          console.log(`soundsUtil: Successfully played sound ${key} after reload at volume ${Math.round(effectiveVolume * 100)}%`);
        }
        return;
      }

      // Set volume
      await sound.setVolumeAsync(effectiveVolume);
      
      // Play from beginning
      await sound.replayAsync();
      
      console.log(`soundsUtil: Successfully played sound ${key} at volume ${Math.round(effectiveVolume * 100)}%`);
    } catch (playError) {
      console.warn(`soundsUtil: Failed to play sound ${key}:`, playError.message);
      // Try to reload the sound if it fails
      try {
        console.log(`soundsUtil: Attempting to reload sound ${key}...`);
        await reloadSound(key);
      } catch (reloadError) {
        console.error(`soundsUtil: Failed to reload sound ${key}:`, reloadError.message);
        // Remove invalid sound from cache as last resort
        delete loadedSounds[key];
      }
    }
  } catch (error) {
    console.warn(`soundsUtil: Failed to play sound ${key}:`, error.message);
    // Don't throw - just log and continue
  }
};

/**
 * Set master volume (0.0 to 1.0)
 * Industry standard: Expose volume control to the app
 */
export const setMasterVolume = async (volume) => {
  try {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    await settingsService.updateSetting('masterVolume', clampedVolume);
    console.log(`soundsUtil: Master volume set to ${Math.round(clampedVolume * 100)}%`);
  } catch (error) {
    console.error('soundsUtil: Failed to set master volume:', error);
  }
};

/**
 * Cleanup all loaded sounds - Industry standard cleanup method
 */
export const cleanupSounds = async () => {
  try {
    console.log('soundsUtil: Cleaning up all loaded sounds...');
    
    // Clean up monitoring first
    cleanupMonitoring();
    
    // Unload all loaded sounds
    const unloadPromises = Object.keys(loadedSounds).map(async (key) => {
      try {
        const sound = loadedSounds[key];
        if (sound && typeof sound.unloadAsync === 'function') {
          await sound.unloadAsync();
        }
      } catch (error) {
        console.warn(`soundsUtil: Error unloading sound ${key}:`, error);
      }
    });
    
    await Promise.allSettled(unloadPromises);
    
    // Clear the loaded sounds object
    Object.keys(loadedSounds).forEach(key => delete loadedSounds[key]);
    
    // Reset flags
    soundsLoaded = false;
    audioConfigured = false;
    
    console.log('soundsUtil: Sound cleanup completed');
  } catch (error) {
    console.error('soundsUtil: Error during cleanup:', error);
  }
};

/**
 * Set sound effects volume (0.0 to 1.0)
 * Industry standard: Separate control for sound effects
 */
export const setSoundEffectsVolume = async (volume) => {
  try {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    await settingsService.updateSetting('soundEffectsVolume', clampedVolume);
    console.log(`soundsUtil: Sound effects volume set to ${Math.round(clampedVolume * 100)}%`);
  } catch (error) {
    console.error('soundsUtil: Failed to set sound effects volume:', error);
  }
};

/**
 * Get current volume settings
 * Industry standard: Allow app to query current state
 */
export const getVolumeSettings = () => {
  try {
    const settings = settingsService.getSettings();
    return {
      masterVolume: settings.masterVolume || 1.0,
      soundEffectsVolume: settings.soundEffectsVolume || 1.0,
      isMuted: settings.soundEffectsVolume === 0,
    };
  } catch (error) {
    console.error('soundsUtil: Failed to get volume settings:', error);
    return {
      masterVolume: 1.0,
      soundEffectsVolume: 1.0,
      isMuted: false,
    };
  }
};

/**
 * Mute/unmute all sounds
 * Industry standard: Quick mute toggle
 */
export const toggleMute = async () => {
  try {
    const settings = settingsService.getSettings();
    const currentVolume = settings.soundEffectsVolume || 1.0;
    const newVolume = currentVolume > 0 ? 0 : 1.0;
    
    await settingsService.updateSetting('soundEffectsVolume', newVolume);
    console.log(`soundsUtil: Sounds ${newVolume > 0 ? 'unmuted' : 'muted'}`);
    
    return newVolume > 0;
  } catch (error) {
    console.error('soundsUtil: Failed to toggle mute:', error);
    return false;
  }
};

/**
 * Cleanup sounds when app closes
 * Industry standard: Proper resource management
 */
export const unloadSounds = async () => {
  try {
    console.log('soundsUtil: Unloading sounds...');
    
    // Clean up monitoring first
    cleanupMonitoring();
    
    for (const sound of Object.values(loadedSounds)) {
      await sound.unloadAsync();
    }
    
    Object.keys(loadedSounds).forEach(key => delete loadedSounds[key]);
    soundsLoaded = false;
    audioConfigured = false;
    
    console.log('soundsUtil: Sounds unloaded successfully');
  } catch (error) {
    console.error('soundsUtil: Failed to unload sounds', error);
  }
};

/**
 * Reconfigure audio mode (useful if settings change)
 * Industry standard: Allow runtime reconfiguration
 */
export const reconfigureAudio = async () => {
  audioConfigured = false;
  await configureAudio();
};

/**
 * Set up AppState monitoring to handle background/foreground transitions
 */
const setupAppStateMonitoring = () => {
  if (appStateSubscription) return;
  
  appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
    console.log(`soundsUtil: AppState changed to ${nextAppState}`);
    
    if (nextAppState === 'active') {
      // App came to foreground - reconfigure audio and validate sounds
      try {
        console.log('soundsUtil: App became active, reconfiguring audio...');
        audioConfigured = false;
        await configureAudio();
        
        // Validate all sounds are still working
        await validateAllSounds();
      } catch (error) {
        console.error('soundsUtil: Error handling app foreground:', error);
      }
    } else if (nextAppState === 'background') {
      console.log('soundsUtil: App went to background');
      // Optional: Pause any currently playing sounds
    }
  });
};

/**
 * Start periodic sound validation to catch corrupted sounds
 */
const startSoundValidation = () => {
  if (soundValidationInterval) return;
  
  // Validate sounds every 5 minutes
  soundValidationInterval = setInterval(async () => {
    try {
      await validateAllSounds();
    } catch (error) {
      console.error('soundsUtil: Error during periodic sound validation:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
};

/**
 * Validate all loaded sounds are still functional
 */
const validateAllSounds = async () => {
  if (!soundsLoaded || Object.keys(loadedSounds).length === 0) return;
  
  console.log('soundsUtil: Validating all sounds...');
  let corruptedCount = 0;
  
  for (const [key, sound] of Object.entries(loadedSounds)) {
    try {
      // Try to access sound properties to validate it's still functional
      if (!sound || typeof sound.setVolumeAsync !== 'function' || typeof sound.replayAsync !== 'function') {
        console.warn(`soundsUtil: Sound ${key} is corrupted, reloading...`);
        await reloadSound(key);
        corruptedCount++;
      }
    } catch (error) {
      console.warn(`soundsUtil: Sound ${key} validation failed, reloading...`, error.message);
      try {
        await reloadSound(key);
        corruptedCount++;
      } catch (reloadError) {
        console.error(`soundsUtil: Failed to reload corrupted sound ${key}:`, reloadError.message);
        delete loadedSounds[key];
      }
    }
  }
  
  if (corruptedCount > 0) {
    console.log(`soundsUtil: Reloaded ${corruptedCount} corrupted sounds`);
  }
};

/**
 * Clean up monitoring and validation
 */
const cleanupMonitoring = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  
  if (soundValidationInterval) {
    clearInterval(soundValidationInterval);
    soundValidationInterval = null;
  }
};
