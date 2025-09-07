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
  orderBy,
  deleteDoc,
  arrayRemove
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { getNotificationService } from './notificationService';

class GameService {
  constructor() {
    this.gameUnsubscribe = null;
  }

  // Get current user from auth state
  getCurrentUser() {
    return auth.currentUser;
  }

  // Create a new PvP game (called when challenge is accepted)
  async createPvPGame(challengeData) {
    try {
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const gameData = {
        gameId,
        challengeId: challengeData.challengeId,
        playerIds: [challengeData.fromUid, challengeData.toUid],
        wordLength: challengeData.wordLength,
        type: 'pvp',
        status: 'ready', // ready, active, waiting_for_opponent, completed
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
      console.log('GameService: PvP game created successfully', { gameId, players: gameData.playerIds });
      
      return gameId;
    } catch (error) {
      console.error('GameService: Failed to create PvP game:', error);
      throw error;
    }
  }

  // Get game document by ID
  async getGame(gameId) {
    try {
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }
      
      const gameData = gameDoc.data();
      
      // Verify user has access to this game (handle both field naming conventions)
      const playersArray = gameData.playerIds || gameData.players;
      if (!playersArray || !playersArray.includes(this.getCurrentUser().uid)) {
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
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game (handle both field naming conventions)
      const playersArray = gameData.playerIds || gameData.players;
      if (!playersArray || !playersArray.includes(this.getCurrentUser().uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      // Determine which field to update based on user's position
      const isCreator = this.getCurrentUser().uid === gameData.creatorId;
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
      
      // Send notification to opponent when word is set
      const opponentId = gameData.playerIds.find(id => id !== this.getCurrentUser().uid);
      if (opponentId) {
        try {
          const currentUserDoc = await getDoc(doc(db, 'users', this.getCurrentUser().uid));
          const currentUserData = currentUserDoc.data();
          
          await getNotificationService().sendPushNotification(
            opponentId,
            'Game Ready!',
            `${currentUserData.username || 'Your opponent'} has set their word. The game is ready to begin!`,
            { 
              type: 'game_ready', 
              gameId,
              senderId: this.getCurrentUser().uid, 
              senderName: currentUserData.username 
            }
          );
          console.log('GameService: Notification sent to opponent about word being set');
        } catch (notificationError) {
          console.error('GameService: Failed to send notification to opponent:', notificationError);
          // Don't throw error - word setting should still succeed even if notification fails
        }
      }
      
      return true;
    } catch (error) {
      console.error('GameService: Failed to set player word:', error);
      throw error;
    }
  }

  // Add a guess to the game
  async addGuess(gameId, guess) {
    try {
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game (handle both field naming conventions)
      const playersArray = gameData.playerIds || gameData.players;
      if (!playersArray || !playersArray.includes(this.getCurrentUser().uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      // Verify it's the user's turn
      if (gameData.currentTurn !== this.getCurrentUser().uid) {
        throw new Error('Not your turn');
      }
      
      // Determine which guesses array to update
      const isCreator = this.getCurrentUser().uid === gameData.creatorId;
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
              updates.winnerId = this.getCurrentUser().uid;
            } else if (opponentAttempts < playerAttempts) {
              updates.winnerId = gameData.playerIds.find(id => id !== this.getCurrentUser().uid);
            } else {
              updates.tie = true;
              updates.winnerId = null;
            }
          } else if (updates.playerSolved) {
            // Only current player solved - check if opponent has max attempts
            const opponentGuesses = isCreator ? gameData.opponentGuesses : gameData.playerGuesses;
            if (opponentGuesses.length >= 25) {
              updates.winnerId = this.getCurrentUser().uid;
            }
          } else if (updates.opponentSolved) {
            // Only opponent solved - check if current player has max attempts
            const playerGuesses = isCreator ? gameData.playerGuesses : gameData.opponentGuesses;
            if (playerGuesses.length >= 25) {
              updates.winnerId = gameData.playerIds.find(id => id !== this.getCurrentUser().uid);
            }
          }
          
          // Send game completion notifications to both players
          try {
            const currentUserId = this.getCurrentUser().uid;
            const opponentId = gameData.playerIds.find(id => id !== currentUserId);
            
            // Get opponent's username for the notification
            const opponentDoc = await getDoc(doc(db, 'users', opponentId));
            const opponentUsername = opponentDoc.exists() ? opponentDoc.data().username || 'Opponent' : 'Opponent';
            
            // Send notification to current player
            if (updates.winnerId === currentUserId) {
              await getNotificationService().sendGameCompletionNotification(
                currentUserId, 
                gameId, 
                `Congratulations! You won against ${opponentUsername}!`
              );
            } else if (updates.tie) {
              await getNotificationService().sendGameCompletionNotification(
                currentUserId, 
                gameId, 
                `It's a tie! Both players reached the same number of attempts.`
              );
            } else {
              await getNotificationService().sendGameCompletionNotification(
                currentUserId, 
                gameId, 
                `Game over! ${opponentUsername} won the game.`
              );
            }
            
            // Send notification to opponent
            if (updates.winnerId === opponentId) {
              await getNotificationService().sendGameCompletionNotification(
                opponentId, 
                gameId, 
                `Congratulations! You won against ${this.getCurrentUser().displayName || 'Opponent'}!`
              );
            } else if (updates.tie) {
              await getNotificationService().sendGameCompletionNotification(
                opponentId, 
                gameId, 
                `It's a tie! Both players reached the same number of attempts.`
              );
            } else {
              await getNotificationService().sendGameCompletionNotification(
                opponentId, 
                gameId, 
                `Game over! ${this.getCurrentUser().displayName || 'Opponent'} won the game.`
              );
            }
          } catch (notificationError) {
            console.error('GameService: Failed to send game completion notifications:', notificationError);
            // Don't fail the game completion if notifications fail
          }
        }
      } else {
        // Switch turns if guess is incorrect
        const nextPlayer = gameData.playerIds.find(id => id !== this.getCurrentUser().uid);
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
            
            // Send game completion notifications for tie game
            try {
              const currentUserId = this.getCurrentUser().uid;
              const opponentId = gameData.playerIds.find(id => id !== currentUserId);
              
              // Get opponent's username for the notification
              const opponentDoc = await getDoc(doc(db, 'users', opponentId));
              const opponentUsername = opponentDoc.exists() ? opponentDoc.data().username || 'Opponent' : 'Opponent';
              
              // Send notification to both players about the tie
              await getNotificationService().sendGameCompletionNotification(
                currentUserId, 
                gameId, 
                `It's a tie! Both players reached the maximum attempts without solving.`
              );
              
              await getNotificationService().sendGameCompletionNotification(
                opponentId, 
                gameId, 
                `It's a tie! Both players reached the maximum attempts without solving.`
              );
            } catch (notificationError) {
              console.error('GameService: Failed to send tie game notifications:', notificationError);
              // Don't fail the game completion if notifications fail
            }
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
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gamesRef = collection(db, 'games');
      const q = query(
        gamesRef,
        where('players', 'array-contains', this.getCurrentUser().uid),
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
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gamesRef = collection(db, 'games');
      const q = query(
        gamesRef,
        where('players', 'array-contains', this.getCurrentUser().uid),
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
    if (!this.getCurrentUser() || !gameId) return null;
    
    const gameRef = doc(db, 'games', gameId);
    
    this.gameUnsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const gameData = doc.data();
        
        // Verify user has access to this game (handle both field naming conventions)
        const playersArray = gameData.playerIds || gameData.players;
        if (playersArray && playersArray.includes(this.getCurrentUser().uid)) {
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
    if (!this.getCurrentUser()) return null;
    
    const gamesRef = collection(db, 'games');
    const q = query(
      gamesRef,
      where('playerIds', 'array-contains', this.getCurrentUser().uid),
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
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game (handle both field naming conventions)
      const playersArray = gameData.playerIds || gameData.players;
      if (!playersArray || !playersArray.includes(this.getCurrentUser().uid)) {
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

  // Check for game timeouts and forfeits
  checkGameTimeouts(gameData) {
    const now = new Date();
    const gameAge = now - new Date(gameData.createdAt);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    if (gameData.status === 'ready') {
      // Challenge phase: 7 days for P2 to accept + set word
      if (gameAge > sevenDays) {
        return 'challenge_expired'; // P2 took too long, challenge expires
      }
    }
    
    if (gameData.status === 'active') {
      // Active phase: 7 days for both players to solve
      const lastActivity = new Date(gameData.lastActivity);
      const daysSinceActivity = (now - lastActivity) / (24 * 60 * 60 * 1000);
      
      if (daysSinceActivity > 7) {
        // Determine who forfeited based on last activity
        const player1Active = gameData.player1?.lastGuess || gameData.player1?.solved;
        const player2Active = gameData.player2?.lastGuess || gameData.player2?.solved;
        
        if (player1Active && !player2Active) {
          return 'player2_forfeited'; // Player 2 inactive
        } else if (player2Active && !player1Active) {
          return 'player1_forfeited'; // Player 1 inactive
        } else {
          return 'both_forfeited'; // Both inactive
        }
      }
    }
    
    return 'active'; // Game is still active
  }

  // Check and update game status based on player solve state
  async checkAndUpdateGameStatus(gameId) {
    try {
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) return null;
      
      const gameData = gameDoc.data();
      
      // Check if game should be in waiting_for_opponent status
      if (gameData.status === 'active' && gameData.player1 && gameData.player2) {
        const player1Solved = gameData.player1.solved || false;
        const player2Solved = gameData.player2.solved || false;
        
        // If one player solved but the other hasn't, update status
        if (player1Solved && !player2Solved) {
          await updateDoc(doc(db, 'games', gameId), {
            status: 'waiting_for_opponent',
            waitingForPlayer: gameData.player2.uid,
            lastUpdated: new Date().toISOString()
          });
          return 'waiting_for_opponent';
        } else if (player2Solved && !player1Solved) {
          await updateDoc(doc(db, 'games', gameId), {
            status: 'waiting_for_opponent',
            waitingForPlayer: gameData.player1.uid,
            lastUpdated: new Date().toISOString()
          });
          return 'waiting_for_opponent';
        }
      }
      
      return gameData.status;
    } catch (error) {
      console.error('GameService: Failed to check/update game status:', error);
      return null;
    }
  }

  // Forfeit game
  async forfeitGame(gameId) {
    try {
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      // Verify user is a player in this game (handle both field naming conventions)
      const playersArray = gameData.playerIds || gameData.players;
      if (!playersArray || !playersArray.includes(this.getCurrentUser().uid)) {
        throw new Error('Access denied: You are not a player in this game');
      }
      
      // Determine winner (the other player)
      const winnerId = playersArray.find(id => id !== this.getCurrentUser().uid);
      
      const updates = {
        status: 'completed',
        winnerId,
        forfeitedBy: this.getCurrentUser().uid,
        completedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        // Auto-mark results as seen for the quitting player to avoid redundant badge/results
        resultsSeenBy: [this.getCurrentUser().uid]
      };
      
      await updateDoc(doc(db, 'games', gameId), updates);
      console.log('GameService: Game forfeited successfully', { gameId, forfeitedBy: this.getCurrentUser().uid });
      
      // Send game completion notification only to the opponent (winner)
      try {
        const currentUserId = this.getCurrentUser().uid;
        const opponentId = gameData.playerIds.find(id => id !== currentUserId);
        
        // Get opponent's username for the notification
        const opponentDoc = await getDoc(doc(db, 'users', opponentId));
        const opponentUsername = opponentDoc.exists() ? opponentDoc.data().username || 'Opponent' : 'Opponent';
        
        // Send notification to opponent (winner)
        await getNotificationService().sendGameCompletionNotification(
          opponentId, 
          gameId, 
          `Your opponent forfeited the game. You win by default!`
        );
      } catch (notificationError) {
        console.error('GameService: Failed to send forfeit notifications:', notificationError);
        // Don't fail the forfeit if notifications fail
      }
      
      return true;
    } catch (error) {
      console.error('GameService: Failed to forfeit game:', error);
      throw error;
    }
  }

  // Handle game timeouts automatically
  async handleGameTimeout(gameId, timeoutType) {
    try {
      if (!this.getCurrentUser()) throw new Error('User not authenticated');
      
      const gameDoc = await getDoc(doc(db, 'games', gameId));
      if (!gameDoc.exists()) throw new Error('Game not found');
      
      const gameData = gameDoc.data();
      
      let updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      switch (timeoutType) {
        case 'challenge_expired':
          // P2 didn't accept within 7 days - no game created
          await deleteDoc(doc(db, 'games', gameId));
          return true;
          
        case 'player1_forfeited':
          // Player 1 inactive for 7 days - Player 2 wins
          updates.winnerId = gameData.playerIds.find(id => id !== gameData.playerIds[0]);
          updates.forfeitedBy = gameData.playerIds[0];
          break;
          
        case 'player2_forfeited':
          // Player 2 inactive for 7 days - Player 1 wins
          updates.winnerId = gameData.playerIds.find(id => id !== gameData.playerIds[1]);
          updates.forfeitedBy = gameData.playerIds[1];
          break;
          
        case 'both_forfeited':
          // Both inactive for 7 days - tie
          updates.tie = true;
          updates.winnerId = null;
          break;
      }
      
      await updateDoc(doc(db, 'games', gameId), updates);
      
      // Send game completion notifications for timeout
      try {
        const player1Id = gameData.playerIds[0];
        const player2Id = gameData.playerIds[1];
        
        // Get usernames for notifications
        const player1Doc = await getDoc(doc(db, 'users', player1Id));
        const player2Doc = await getDoc(doc(db, 'users', player2Id));
        const player1Username = player1Doc.exists() ? player1Doc.data().username || 'Player 1' : 'Player 1';
        const player2Username = player2Doc.exists() ? player2Doc.data().username || 'Player 2' : 'Player 2';
        
        switch (timeoutType) {
          case 'player1_forfeited':
            // Player 1 inactive - Player 2 wins
            await getNotificationService().sendGameCompletionNotification(
              player1Id, 
              gameId, 
              `Game timed out due to inactivity. ${player2Username} wins by default.`
            );
            await getNotificationService().sendGameCompletionNotification(
              player2Id, 
              gameId, 
              `Your opponent timed out due to inactivity. You win by default!`
            );
            break;
            
          case 'player2_forfeited':
            // Player 2 inactive - Player 1 wins
            await getNotificationService().sendGameCompletionNotification(
              player2Id, 
              gameId, 
              `Game timed out due to inactivity. ${player1Username} wins by default.`
            );
            await getNotificationService().sendGameCompletionNotification(
              player1Id, 
              gameId, 
              `Your opponent timed out due to inactivity. You win by default!`
            );
            break;
            
          case 'both_forfeited':
            // Both inactive - tie
            await getNotificationService().sendGameCompletionNotification(
              player1Id, 
              gameId, 
              `Game timed out due to inactivity from both players. It's a tie.`
            );
            await getNotificationService().sendGameCompletionNotification(
              player2Id, 
              gameId, 
              `Game timed out due to inactivity from both players. It's a tie.`
            );
            break;
        }
      } catch (notificationError) {
        console.error('GameService: Failed to send timeout notifications:', notificationError);
        // Don't fail the timeout handling if notifications fail
      }
      
      // Delete completed game and preserve statistics
      await this.deleteCompletedGame(gameId, { ...gameData, ...updates });
      
      return true;
    } catch (error) {
      console.error('GameService: Failed to handle game timeout:', error);
      throw error;
    }
  }

  // Delete completed game and preserve only statistics
  async deleteCompletedGame(gameId, gameData) {
    try {
      console.log('🗑️ GameService: Deleting completed game:', gameId);
      
      // Attempt to remove this game from both players' activeGames arrays (best-effort)
      try {
        const playerIds = gameData.playerIds || gameData.players || [];
        if (Array.isArray(playerIds) && playerIds.length >= 2) {
          await Promise.all([
            updateDoc(doc(db, 'users', playerIds[0]), { activeGames: arrayRemove(gameId) }).catch(() => {}),
            updateDoc(doc(db, 'users', playerIds[1]), { activeGames: arrayRemove(gameId) }).catch(() => {})
          ]);
        }
      } catch (cleanupError) {
        console.error('GameService: Failed to clean up activeGames arrays during deletion:', cleanupError);
      }

      // Extract only the statistics needed for leaderboard
      const gameStats = {
        gameId: gameId,
        players: gameData.playerIds,
        completedAt: gameData.completedAt,
        winnerId: gameData.winnerId,
        tie: gameData.tie,
        type: 'pvp',
        wordLength: gameData.wordLength, // Add wordLength for difficulty filtering
        forfeitedBy: gameData.forfeitedBy ?? null,
        // Preserve player performance data for leaderboard calculations
        playerStats: {
          [gameData.playerIds[0]]: {
            attempts: gameData.player1?.attempts || gameData.playerGuesses?.length || 0,
            solved: gameData.player1?.solved || false,
            solveTime: gameData.player1?.solveTime
          },
          [gameData.playerIds[1]]: {
            attempts: gameData.player2?.attempts || gameData.opponentGuesses?.length || 0,
            solved: gameData.player2?.solved || false,
            solveTime: gameData.player2?.solveTime
          }
        }
      };
      
      // Save statistics to a separate collection for leaderboard purposes
      const statsRef = doc(db, 'gameStats', gameId);
      await setDoc(statsRef, gameStats);
      console.log('📊 GameService: Game statistics preserved for leaderboard');
      
      // Delete the actual game document
      await deleteDoc(doc(db, 'games', gameId));
      console.log('🗑️ GameService: Game document deleted successfully');
      
      return true;
    } catch (error) {
      console.error('GameService: Failed to delete completed game:', error);
      // Don't throw error - just log it to avoid breaking the game flow
      return false;
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
