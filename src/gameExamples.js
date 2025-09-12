import gameService from './gameService';
import authService from './authService';

// Initialize the game service with current user
export const initializeGameService = async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      gameService.setCurrentUser(currentUser);
    }
  } catch (error) {
    console.error('Failed to initialize GameService:', error);
  }
};

// Example: Set up real-time game listener
export const setupGameListener = (gameId, onGameUpdate) => {
  try {
    const unsubscribe = gameService.listenToGame(gameId, (gameData) => {
      if (gameData) {
        onGameUpdate(gameData);
      } else {
      }
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Failed to setup game listener:', error);
  }
};

// Example: Set up listener for all active PvP games
export const setupActiveGamesListener = (onGamesUpdate) => {
  try {
    const unsubscribe = gameService.listenToActivePvPGames((games) => {
      onGamesUpdate(games);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Failed to setup active games listener:', error);
  }
};

// Example: Player sets their word for the game
export const setWordForGame = async (gameId, word) => {
  try {
    await gameService.setPlayerWord(gameId, word);
    return true;
  } catch (error) {
    console.error('Failed to set word:', error);
    throw error;
  }
};

// Example: Add a guess to the game
export const makeGuess = async (gameId, word, feedback = null) => {
  try {
    const guess = {
      word,
      feedback,
      dots: [], // Add your feedback logic here
      circles: [] // Add your feedback logic here
    };
    
    const result = await gameService.addGuess(gameId, guess);
    return result;
  } catch (error) {
    console.error('Failed to make guess:', error);
    throw error;
  }
};

// Example: Get current game state
export const getCurrentGame = async (gameId) => {
  try {
    const game = await gameService.getGame(gameId);
    return game;
  } catch (error) {
    console.error('Failed to get game:', error);
    throw error;
  }
};

// Example: Get all active PvP games for current user
export const getMyActiveGames = async () => {
  try {
    const games = await gameService.getActivePvPGames();
    return games;
  } catch (error) {
    console.error('Failed to get active games:', error);
    return [];
  }
};

// Example: Get completed games for current user
export const getMyCompletedGames = async (limit = 10) => {
  try {
    const games = await gameService.getCompletedPvPGames(limit);
    return games;
  } catch (error) {
    console.error('Failed to get completed games:', error);
    return [];
  }
};

// Example: Update game status
export const updateGameStatus = async (gameId, status, additionalData = {}) => {
  try {
    await gameService.updateGameStatus(gameId, status, additionalData);
    return true;
  } catch (error) {
    console.error('Failed to update game status:', error);
    throw error;
  }
};

// Example: Forfeit a game
export const forfeitGame = async (gameId) => {
  try {
    await gameService.forfeitGame(gameId);
    return true;
  } catch (error) {
    console.error('Failed to forfeit game:', error);
    throw error;
  }
};

// Example: Complete game flow - from word setting to completion
export const completeGameFlow = async (gameId) => {
  try {
    // 1. Get current game state
    const game = await gameService.getGame(gameId);
    
    // 2. Set up real-time listener
    const unsubscribe = gameService.listenToGame(gameId, (gameData) => {
      if (gameData) {
        
        // Handle different game states
        switch (gameData.status) {
          case 'ready':
            break;
          case 'active':
            break;
          case 'completed':
            break;
        }
      }
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Failed to setup complete game flow:', error);
    throw error;
  }
};

// Example: Handle turn-based gameplay
export const handleTurnBasedGameplay = async (gameId) => {
  try {
    const game = await gameService.getGame(gameId);
    
    if (game.status !== 'active') {
      return;
    }
    
    // Check if it's the current user's turn
    if (game.currentTurn === authService.getCurrentUser()?.uid) {
      // Enable input for making guesses
      return true;
    } else {
      // Disable input, show waiting message
      return false;
    }
  } catch (error) {
    console.error('Failed to handle turn-based gameplay:', error);
    return false;
  }
};

// Example: Get game statistics
export const getGameStats = async (gameId) => {
  try {
    const game = await gameService.getGame(gameId);
    
    const stats = {
      totalGuesses: (game.playerGuesses?.length || 0) + (game.opponentGuesses?.length || 0),
      playerGuesses: game.playerGuesses?.length || 0,
      opponentGuesses: game.opponentGuesses?.length || 0,
      playerSolved: game.playerSolved || false,
      opponentSolved: game.opponentSolved || false,
      gameDuration: game.completedAt ? 
        new Date(game.completedAt) - new Date(game.createdAt) : null,
      winner: game.winnerId,
      status: game.status
    };
    
    return stats;
  } catch (error) {
    console.error('Failed to get game stats:', error);
    throw error;
  }
};

// Example: Cleanup when leaving a game
export const cleanupGame = () => {
  try {
    gameService.cleanup();
  } catch (error) {
    console.error('Failed to cleanup game service:', error);
  }
};

// Example: React component usage pattern
export const useGameService = (gameId) => {
  const [game, setGame] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  
  React.useEffect(() => {
    if (!gameId) return;
    
    setLoading(true);
    
    // Set up real-time listener
    const unsubscribe = gameService.listenToGame(gameId, (gameData) => {
      if (gameData) {
        setGame(gameData);
        setError(null);
      } else {
        setError('Game not found or access denied');
      }
      setLoading(false);
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [gameId]);
  
  const makeGuess = React.useCallback(async (word) => {
    try {
      return await gameService.addGuess(gameId, { word });
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }, [gameId]);
  
  const setWord = React.useCallback(async (word) => {
    try {
      return await gameService.setPlayerWord(gameId, word);
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }, [gameId]);
  
  return {
    game,
    loading,
    error,
    makeGuess,
    setWord,
    isMyTurn: game?.currentTurn === authService.getCurrentUser()?.uid
  };
};

export default {
  initializeGameService,
  setupGameListener,
  setupActiveGamesListener,
  setWordForGame,
  makeGuess,
  getCurrentGame,
  getMyActiveGames,
  getMyCompletedGames,
  updateGameStatus,
  forfeitGame,
  completeGameFlow,
  handleTurnBasedGameplay,
  getGameStats,
  cleanupGame,
  useGameService
};
