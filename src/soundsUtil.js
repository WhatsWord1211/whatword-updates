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
};

const sounds = {};
let isLoading = false;

export const loadSounds = async () => {
  if (isLoading || Object.keys(sounds).length > 0) return;
  isLoading = true;
  const failed = [];
  const loaded = [];

  try {
    for (const [key, soundFile] of Object.entries(soundFiles)) {
      try {
        const { sound } = await Audio.Sound.createAsync(soundFile, { shouldPlay: false });
        sounds[key] = sound;
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          loaded.push(key);
        } else {
          console.error(`soundsUtil: Sound ${key} loaded but not ready`, status);
          failed.push(key);
        }
      } catch (error) {
        console.error(`soundsUtil: Failed to load sound ${key}`, error);
        failed.push(key);
      }
    }
    if (failed.length > 0) {
      console.log('soundsUtil: Some sounds failed to load:', { failed, loaded });
    }
  } finally {
    isLoading = false;
  }
};

export const playSound = async (key, options = {}) => {
  if (!sounds[key]) {
    // Attempt a lazy load if not preloaded
    try {
      const file = soundFiles[key];
      if (file) {
        const { sound } = await Audio.Sound.createAsync(file, { shouldPlay: false });
        sounds[key] = sound;
      } else {
        console.error(`soundsUtil: Sound ${key} not loaded`);
        throw new Error(`Sound ${key} not loaded`);
      }
    } catch (e) {
      console.error(`soundsUtil: Failed lazy-load for ${key}`);
      throw e;
    }
  }
  try {
    const sound = sounds[key];
    let status = await sound.getStatusAsync();
    if (!status.isLoaded) {
      try {
        await sound.unloadAsync();
      } catch (_) {}
      try {
        await sound.loadAsync(soundFiles[key], { shouldPlay: false });
      } catch (reloadErr) {
        // Ignore benign race condition where sound is already loaded
        if (!String(reloadErr?.message || reloadErr).includes('already loaded')) {
          throw reloadErr;
        }
      }
      status = await sound.getStatusAsync();
    }
    if (options.volume !== undefined) {
      await sound.setVolumeAsync(options.volume);
    }
    
    try {
      await sound.replayAsync();
    } catch (playErr) {
      // If replayAsync fails due to load state, try a single recover attempt
      if (String(playErr?.message || playErr).includes('already loaded')) {
        try {
          await sound.stopAsync();
        } catch (_) {}
        await sound.replayAsync();
      } else {
        throw playErr;
      }
    }
    
    if (options.volume !== undefined) {
      await sound.setVolumeAsync(1);
    }
    // console.log(`soundsUtil: Sound ${key} played successfully`); // Reduced logging
  } catch (error) {
    console.error(`soundsUtil: Failed to play sound ${key}`, error);
    throw error;
  }
};

export const unloadSounds = async () => {
  for (const key of Object.keys(sounds)) {
    if (sounds[key]) {
      try {
        await sounds[key].unloadAsync();
        console.log(`soundsUtil: Unloaded sound ${key}`);
      } catch (error) {
        console.error(`soundsUtil: Failed to unload sound ${key}`, error);
      }
    }
  }
  Object.keys(sounds).forEach(key => delete sounds[key]);
};