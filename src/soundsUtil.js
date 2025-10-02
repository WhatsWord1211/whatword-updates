import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import settingsService from './settingsService';

const soundFiles = {
  feedbackDot: require('../assets/sounds/feedbackDot.mp3'),
  feedbackCircle: require('../assets/sounds/feedbackCircle.mp3'),
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
      // Set volume
      await sound.setVolumeAsync(effectiveVolume);
      
      // Play from beginning
      await sound.replayAsync();
      
      console.log(`soundsUtil: Playing sound ${key} at volume ${Math.round(effectiveVolume * 100)}%`);
    } catch (playError) {
      console.warn(`soundsUtil: Failed to play sound ${key}:`, playError.message);
      // Remove invalid sound from cache
      delete loadedSounds[key];
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
