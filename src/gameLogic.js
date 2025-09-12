import { easyWordList } from './easywords';
import { wordList } from './words';
import { hardWordList } from './hardwords';

const easyWords = easyWordList || [];
const words = wordList || [];
const hardWords = hardWordList || [];


export const isValidWord = async (word, wordLength) => {
  try {
    const validWords = wordLength === 4 ? easyWords :
                       wordLength === 6 ? hardWords :
                       words;
    if (!Array.isArray(validWords) || validWords.length === 0) {
      console.error('gameLogic: Word list is empty or invalid', { wordLength });
      throw new Error(`Invalid word list for length ${wordLength}`);
    }
    const isValid = validWords.includes(word.toLowerCase());
    return isValid;
  } catch (error) {
    console.error('gameLogic: isValidWord error', { error: error.message, stack: error.stack });
    throw error;
  }
};

export const selectRandomWord = async (wordLength) => {
  try {
    const validWords = wordLength === 4 ? easyWords :
                       wordLength === 6 ? hardWords :
                       words;
    if (!Array.isArray(validWords) || validWords.length === 0) {
      console.error('gameLogic: Word list is empty or invalid', { wordLength });
      throw new Error(`Invalid word list for length ${wordLength}`);
    }
    const selectedWord = validWords[Math.floor(Math.random() * validWords.length)];
    return selectedWord.toUpperCase();
  } catch (error) {
    console.error('gameLogic: selectRandomWord error', { error: error.message, stack: error.stack });
    throw error;
  }
};

export const getFeedback = (guess, target) => {
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
  });

  for (let i = 0; i < guessArray.length; i++) {
    if (guessArray[i] === targetArray[i]) {
      feedback[i] = 'correct';
      dots++;
      targetLetterCount[guessArray[i]]--;
    }
  }

  for (let i = 0; i < guessArray.length; i++) {
    if (feedback[i] === 'none' && targetLetterCount[guessArray[i]] > 0) {
      feedback[i] = 'present';
      circles++;
      targetLetterCount[guessArray[i]]--;
    }
  }

  return { dots, circles, feedback };
};