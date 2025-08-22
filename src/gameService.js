import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc, 
  onSnapshot,
  collection,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db, auth } from './firebase';

class GameService {
  constructor() {
    this.currentUser = null;
    this.gameUnsubscribe = null;
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  // Create a new PvP game (called when challenge is accepted)
  async createPvPGame(challengeData) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const gameData = {
        gameId,
        challengeId: challengeData.challengeId,
        players: [challengeData.fromUid, challengeData.toUid],
        wordLength: challengeData.wordLength,
        type: 'pvp',
        status: 'ready', // ready, active, completed
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        
        // Game state fields
        playerWord: null,        // Word set by player 1 (fromUid)
        opponentWord: null,      // Word set by player 2 (toUid)
        playerGuesses: [],       // Guesses made by player 1
        opponentGuesses: [],     // Guesses made by player 2
        currentTurn: challengeData.fromUid, // Who goes first (challenge sender)
        
        // Race mode specific fields
        playerSolved: false,
        opponentSolved: false,
        playerSolveTime: null,
        opponentSolveTime: null,
        winnerId: null,
        tie: false,
        
        // Metadata
        creatorId: challengeData.fromUid,
        lastActivity: new Date().toISOString()
      };

      await setDoc(doc(db, 'games', gameId), gameData);
      console.log('GameService: PvP game created successfully', { gameId, players: gameData.players });
      
      return gameId;
    } catch (error) {
      console.error('GameService: Failed to create PvP game:', error);
      throw error;
    }
  }

  // Get game document by ID
  async getGame(gameId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }
      
      const gameData = gameDoc.data();
      
      // Verify user has access to this game
      if (!gameData.players.includes(this.currentUser.uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      return { id: gameDoc.id, ...gameData };
    } catch (error) {
      console.error('GameService: Failed to get game:', error);
      throw error;
    }
  }

  // Update game word (when player sets their word)
  async setPlayerWord(gameId, word) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game
      if (!gameData.players.includes(this.currentUser.uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      // Determine which field to update based on user's position
      const isCreator = this.currentUser.uid === gameData.creatorId;
      const updateField = isCreator ? 'playerWord' : 'opponentWord';
      
      const updates = {
        [updateField]: word.toUpperCase(),
        lastUpdated: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      // Check if both words are set to start the game
      if (isCreator && gameData.opponentWord) {
        updates.status = 'active';
        updates.currentTurn = gameData.creatorId; // Creator goes first
      } else if (!isCreator && gameData.playerWord) {
        updates.status = 'active';
        updates.currentTurn = gameData.creatorId; // Creator goes first
      }
      
      await updateDoc(doc(db, 'games', gameId), updates);
      console.log('GameService: Player word set successfully', { gameId, word, updateField });
      
      return true;
    } catch (error) {
      console.error('GameService: Failed to set player word:', error);
      throw error;
    }
  }

  // Add a guess to the game
  async addGuess(gameId, guess) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game
      if (!gameData.playerIds.includes(this.currentUser.uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      // Verify it's the user's turn
      if (gameData.currentTurn !== this.currentUser.uid) {
        throw new Error('Not your turn');
      }
      
      // Determine which guesses array to update
      const isCreator = this.currentUser.uid === gameData.creatorId;
      const guessesField = isCreator ? 'playerGuesses' : 'opponentGuesses';
      const targetWord = isCreator ? gameData.opponentWord : gameData.playerWord;
      
      // Process the guess
      const processedGuess = {
        word: guess.word.toUpperCase(),
        timestamp: new Date().toISOString(),
        isCorrect: guess.word.toUpperCase() === targetWord,
        feedback: guess.feedback || null,
        dots: guess.dots || [],
        circles: guess.circles || []
      };
      
      // Update the game
      const updates = {
        [guessesField]: [...gameData[guessesField], processedGuess],
        lastUpdated: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      // Check if the guess is correct
      if (processedGuess.isCorrect) {
        const solveTime = new Date().toISOString();
        if (isCreator) {
          updates.playerSolved = true;
          updates.playerSolveTime = solveTime;
        } else {
          updates.opponentSolved = true;
          updates.opponentSolveTime = solveTime;
        }
        
        // Check if game is over based on completion conditions
        const isGameOver = this.checkGameCompletion(gameData, updates);
        if (isGameOver) {
          updates.status = 'completed';
          updates.completedAt = new Date().toISOString();
          
          // Determine winner based on completion conditions
          if (updates.playerSolved && updates.opponentSolved) {
            // Both solved - determine winner by attempts
            const playerAttempts = (isCreator ? updates.playerGuesses : gameData.playerGuesses).length;
            const opponentAttempts = (isCreator ? gameData.opponentGuesses : updates.opponentGuesses).length;
            
            if (playerAttempts < opponentAttempts) {
              updates.winnerId = this.currentUser.uid;
            } else if (opponentAttempts < playerAttempts) {
              updates.winnerId = gameData.players.find(id => id !== this.currentUser.uid);
            } else {
              updates.tie = true;
              updates.winnerId = null;
            }
          } else if (updates.playerSolved) {
            // Only current player solved - check if opponent has max attempts
            const opponentGuesses = isCreator ? gameData.opponentGuesses : gameData.playerGuesses;
            if (opponentGuesses.length >= 25) {
              updates.winnerId = this.currentUser.uid;
            }
                      } else if (updates.opponentSolved) {
              // Only opponent solved - check if current player has max attempts
              const playerGuesses = isCreator ? gameData.playerGuesses : gameData.opponentGuesses;
              if (playerGuesses.length >= 25) {
                updates.winnerId = gameData.players.find(id => id !== this.currentUser.uid);
              }
            }
        }
      } else {
        // Switch turns if guess is incorrect
        const nextPlayer = gameData.players.find(id => id !== this.currentUser.uid);
        updates.currentTurn = nextPlayer;
        
        // Check if game is over due to max attempts (without solving)
        const currentPlayerGuesses = isCreator ? updates.playerGuesses : gameData.playerGuesses;
        const opponentGuesses = isCreator ? gameData.opponentGuesses : updates.opponentGuesses;
        
        if (currentPlayerGuesses.length >= 25 && opponentGuesses.length >= 25) {
          // Both players reached max attempts without solving
          const isGameOver = this.checkGameCompletion(gameData, updates);
          if (isGameOver) {
            updates.status = 'completed';
            updates.completedAt = new Date().toISOString();
            updates.tie = true;
            updates.winnerId = null;
          }
        }
      }
      
      await updateDoc(doc(db, 'games', gameId), updates);
      console.log('GameService: Guess added successfully', { gameId, guess: processedGuess.word });
      
      return processedGuess;
    } catch (error) {
      console.error('GameService: Failed to add guess:', error);
      throw error;
    }
  }

  // Get all active PvP games for the current user
  async getActivePvPGames() {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gamesRef = collection(db, 'games');
      const q = query(
        gamesRef,
        where('players', 'array-contains', this.currentUser.uid),
        where('type', '==', 'pvp'),
        where('status', 'in', ['ready', 'active']),
        orderBy('lastActivity', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const games = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      return games;
    } catch (error) {
      console.error('GameService: Failed to get active PvP games:', error);
      return [];
    }
  }

  // Get completed PvP games for the current user
  async getCompletedPvPGames(limit = 20) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gamesRef = collection(db, 'games');
      const q = query(
        gamesRef,
        where('players', 'array-contains', this.currentUser.uid),
        where('type', '==', 'pvp'),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        limit(limit)
      );
      
      const querySnapshot = await getDocs(q);
      const games = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      return games;
    } catch (error) {
      console.error('GameService: Failed to get completed PvP games:', error);
      return [];
    }
  }

  // Listen to real-time game updates
  listenToGame(gameId, callback) {
    if (!this.currentUser || !gameId) return null;
    
    const gameRef = doc(db, 'games', gameId);
    
    this.gameUnsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const gameData = doc.data();
        
        // Verify user has access to this game
        if (gameData.players.includes(this.currentUser.uid)) {
          callback({ id: doc.id, ...gameData });
        } else {
          console.warn('GameService: Access denied to game updates');
          callback(null);
        }
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('GameService: Error listening to game:', error);
      callback(null);
    });
    
    return this.gameUnsubscribe;
  }

  // Listen to all active PvP games for the current user
  listenToActivePvPGames(callback) {
    if (!this.currentUser) return null;
    
    const gamesRef = collection(db, 'games');
    const q = query(
      gamesRef,
      where('players', 'array-contains', this.currentUser.uid),
              where('type', '==', 'pvp'),
        where('status', 'in', ['ready', 'active']),
        orderBy('lastActivity', 'desc')
    );
    
    this.activeGamesUnsubscribe = onSnapshot(q, (snapshot) => {
      const games = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(games);
    }, (error) => {
      console.error('GameService: Error listening to active games:', error);
      callback([]);
    });
    
    return this.activeGamesUnsubscribe;
  }

  // Update game status
  async updateGameStatus(gameId, status, additionalData = {}) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game
      if (!gameData.playerIds.includes(this.currentUser.uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      const updates = {
        status,
        lastUpdated: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        ...additionalData
      };
      
      await updateDoc(doc(db, 'games', gameId), updates);
      console.log('GameService: Game status updated successfully', { gameId, status });
      
      return true;
    } catch (error) {
      console.error('GameService: Failed to update game status:', error);
      throw error;
    }
  }

  // Check if game should be completed based on various conditions
  checkGameCompletion(gameData, updates) {
    // Get current state including updates
    const playerSolved = updates.playerSolved !== undefined ? updates.playerSolved : gameData.playerSolved;
    const opponentSolved = updates.opponentSolved !== undefined ? updates.opponentSolved : gameData.opponentSolved;
    
    // Get current guess counts including updates
    const playerGuesses = updates.playerGuesses || gameData.playerGuesses || [];
    const opponentGuesses = updates.opponentGuesses || gameData.opponentGuesses || [];
    
    // Game completion conditions:
    // 1. Both players solved their opponent's word
    if (playerSolved && opponentSolved) {
      return true;
    }
    
    // 2. One player solved and the other reached max attempts
    if (playerSolved && opponentGuesses.length >= 25) {
      return true;
    }
    
    if (opponentSolved && playerGuesses.length >= 25) {
      return true;
    }
    
    // 3. Both players reached max attempts without solving
    if (playerGuesses.length >= 25 && opponentGuesses.length >= 25) {
      return true;
    }
    
    // 4. One player forfeited (handled separately in forfeitGame)
    
    return false;
  }

  // Forfeit game
  async forfeitGame(gameId) {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game
      if (!gameData.players.includes(this.currentUser.uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      // Determine winner (the other player)
      const winnerId = gameData.players.find(id => id !== this.currentUser.uid);
      
      const updates = {
        status: 'completed',
        winnerId,
        forfeitedBy: this.currentUser.uid,
        completedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      await updateDoc(doc(db, 'games', gameId), updates);
      console.log('GameService: Game forfeited successfully', { gameId, forfeitedBy: this.currentUser.uid });
      
      return true;
    } catch (error) {
      console.error('GameService: Failed to forfeit game:', error);
      throw error;
    }
  }

  // Cleanup listeners
  cleanup() {
    if (this.gameUnsubscribe) {
      this.gameUnsubscribe();
      this.gameUnsubscribe = null;
    }
    if (this.activeGamesUnsubscribe) {
      this.activeGamesUnsubscribe();
      this.activeGamesUnsubscribe = null;
    }
  }
}

export default new GameService();
