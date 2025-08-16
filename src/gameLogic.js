import { easyWordList } from './easywords';
import { wordList } from './words';
import { hardWordList } from './hardwords';

const easyWords = easyWordList || [];
const words = wordList || [];
const hardWords = hardWordList || [];

console.log('gameLogic: Word lists loaded', {
  easyWordsLength: easyWords.length,
  wordsLength: words.length,
  hardWordsLength: hardWords.length,
  timestamp: new Date().toISOString(),
});

export const isValidWord = async (word, wordLength) => {
  try {
    console.log('gameLogic: isValidWord called', { word, wordLength });
    const validWords = wordLength === 4 ? easyWords :
                       wordLength === 6 ? hardWords :
                       words;
    if (!Array.isArray(validWords) || validWords.length === 0) {
      console.error('gameLogic: Word list is empty or invalid', { wordLength });
      throw new Error(`Invalid word list for length ${wordLength}`);
    }
    const isValid = validWords.includes(word.toLowerCase());
    console.log('gameLogic: isValidWord result', { word, isValid });
    return isValid;
  } catch (error) {
    console.error('gameLogic: isValidWord error', { error: error.message, stack: error.stack });
    throw error;
  }
};

export const selectRandomWord = async (wordLength) => {
  try {
    console.log('gameLogic: selectRandomWord called', { wordLength });
    const validWords = wordLength === 4 ? easyWords :
                       wordLength === 6 ? hardWords :
                       words;
    if (!Array.isArray(validWords) || validWords.length === 0) {
      console.error('gameLogic: Word list is empty or invalid', { wordLength });
      throw new Error(`Invalid word list for length ${wordLength}`);
    }
    const selectedWord = validWords[Math.floor(Math.random() * validWords.length)];
    console.log('gameLogic: Selected word', { selectedWord });
    return selectedWord.toUpperCase();
  } catch (error) {
    console.error('gameLogic: selectRandomWord error', { error: error.message, stack: error.stack });
    throw error;
  }
};

export const getFeedback = (guess, target) => {
  console.log('gameLogic: getFeedback called', { guess, target });
  if (!target || !guess) {
    console.error('gameLogic: getFeedback error', { error: 'Target or guess is null or undefined', guess, target });
    return { dots: 0, circles: 0, feedback: Array(guess?.length || 5).fill('none') };
  }
  const guessArray = guess.toUpperCase().split('');
  const targetArray = target.toUpperCase().split('');
  const feedback = Array(guessArray.length).fill('none');
  let dots = 0;
  let circles = 0;

  const targetLetterCount = {};
  targetArray.forEach((letter, idx) => {
    targetLetterCount[letter] = (targetLetterCount[letter] || 0) + 1;
    console.log('gameLogic: Building targetLetterCount', { letter, index: idx, count: targetLetterCount[letter] });
  });

  for (let i = 0; i < guessArray.length; i++) {
    if (guessArray[i] === targetArray[i]) {
      feedback[i] = 'correct';
      dots++;
      targetLetterCount[guessArray[i]]--;
      console.log('gameLogic: Correct position', { letter: guessArray[i], index: i, dots });
    }
  }

  for (let i = 0; i < guessArray.length; i++) {
    if (feedback[i] === 'none' && targetLetterCount[guessArray[i]] > 0) {
      feedback[i] = 'present';
      circles++;
      targetLetterCount[guessArray[i]]--;
      console.log('gameLogic: Correct letter, wrong position', { letter: guessArray[i], index: i, circles });
    }
  }

  console.log('gameLogic: getFeedback result', { dots, circles, feedback, targetLetterCount });
  return { dots, circles, feedback };
};