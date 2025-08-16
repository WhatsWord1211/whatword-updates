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
        console.log(`soundsUtil: Attempting to load sound ${key}`);
        const { sound } = await Audio.Sound.createAsync(soundFile, { shouldPlay: false });
        sounds[key] = sound;
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          loaded.push(key);
          console.log(`soundsUtil: Sound ${key} loaded successfully`);
        } else {
          console.error(`soundsUtil: Sound ${key} loaded but not ready`, status);
          failed.push(key);
        }
      } catch (error) {
        console.error(`soundsUtil: Failed to load sound ${key}`, error);
        failed.push(key);
      }
    }
    console.log('soundsUtil: All sounds processed', { failed, loaded });
  } finally {
    isLoading = false;
  }
};

export const playSound = async (key, options = {}) => {
  if (!sounds[key]) {
    console.error(`soundsUtil: Sound ${key} not loaded`);
    throw new Error(`Sound ${key} not loaded`);
  }
  try {
    const sound = sounds[key];
    const status = await sound.getStatusAsync();
    console.log(`soundsUtil: Playing sound ${key}`, { status });
    if (!status.isLoaded) {
      console.warn(`soundsUtil: Reloading sound ${key}`);
      await sound.loadAsync(soundFiles[key], { shouldPlay: false });
    }
    if (options.volume !== undefined) {
      await sound.setVolumeAsync(options.volume);
    }
    await sound.replayAsync();
    if (options.volume !== undefined) {
      await sound.setVolumeAsync(1);
    }
    console.log(`soundsUtil: Sound ${key} played successfully`);
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