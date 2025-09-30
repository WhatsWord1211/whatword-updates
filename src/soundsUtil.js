import { Audio } from 'expo-av';

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

// Load all sounds on app start
export const loadSounds = async () => {
  if (soundsLoaded) return;
  
  try {
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

// Check if sounds are ready
export const areSoundsReady = () => soundsLoaded;

// Play a preloaded sound
export const playSound = async (key, options = {}) => {
  try {
    // Wait for sounds to be loaded if they're not ready yet
    if (!soundsLoaded) {
      await loadSounds();
    }

    const sound = loadedSounds[key];
    if (!sound) {
      console.warn(`soundsUtil: Sound ${key} not loaded, skipping play`);
      return;
    }

           // Check if sound is still valid before playing
           try {
             if (options.volume !== undefined) {
               await sound.setVolumeAsync(options.volume);
             }
             
             await sound.replayAsync();
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

// Cleanup sounds when app closes
export const unloadSounds = async () => {
  try {
    for (const sound of Object.values(loadedSounds)) {
      await sound.unloadAsync();
    }
    Object.keys(loadedSounds).forEach(key => delete loadedSounds[key]);
  } catch (error) {
    console.error('soundsUtil: Failed to unload sounds', error);
  }
};
