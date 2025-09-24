import { doc, getDoc, updateDoc, increment, arrayUnion, arrayRemove, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

class PlayerProfileService {
  // Get user profile
  async getUserProfile(uid) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return { uid, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('PlayerProfileService: Failed to get user profile:', error);
      throw error;
    }
  }

  // Update game statistics
  async updateGameStats(uid, gameResult) {
    try {
      const updates = {
        gamesPlayed: increment(1),
        lastGamePlayed: new Date().toISOString()
      };

      // Track hint usage
      if (gameResult.usedHints && gameResult.usedHints > 0) {
        updates.hintsUsed = increment(gameResult.usedHints);
        updates.gamesWithHints = increment(1);
      } else {
        updates.gamesWithoutHints = increment(1);
      }

      if (gameResult.won) {
        updates.gamesWon = increment(1);
        updates.currentStreak = increment(1);
        
        // Update best score if this game was better
        if (gameResult.score > (gameResult.bestScore || 0)) {
          updates.bestScore = gameResult.score;
        }
        
        // Update total score
        updates.totalScore = increment(gameResult.score);
      } else {
        // Reset streak on loss
        updates.currentStreak = 0;
        updates.totalScore = increment(gameResult.score);
      }

      // Update average score (all games count now with penalty scoring)
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentTotal = userData.totalScore || 0;
        const currentGames = userData.gamesPlayed || 0;
        const newTotal = currentTotal + gameResult.score;
        const newGames = currentGames + 1;
        updates.averageScore = Math.round(newTotal / newGames);
      }

              await updateDoc(doc(db, 'users', uid), updates);
        
        // Update rolling averages for difficulty-specific ranking
        if (gameResult.difficulty) {
          await this.updateDifficultyRollingAverages(uid, gameResult.difficulty, gameResult.score);
        }
        
        // Check for achievements
        await this.checkAchievements(uid, updates);
        
        return true;
    } catch (error) {
      console.error('PlayerProfileService: Failed to update game stats:', error);
      throw error;
    }
  }

  // Check and award achievements
  async checkAchievements(uid, gameStats) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (!userDoc.exists()) return;

      const userData = userDoc.data();
      const newAchievements = [];

      // First win achievement
      if (gameStats.gamesWon === 1 && !userData.achievements?.includes('first_win')) {
        newAchievements.push('first_win');
      }

      // Win streak achievements
      if (gameStats.currentStreak >= 3 && !userData.achievements?.includes('streak_3')) {
        newAchievements.push('streak_3');
      }
      if (gameStats.currentStreak >= 5 && !userData.achievements?.includes('streak_5')) {
        newAchievements.push('streak_5');
      }
      if (gameStats.currentStreak >= 10 && !userData.achievements?.includes('streak_10')) {
        newAchievements.push('streak_10');
      }

      // Games played achievements
      const totalGames = (userData.gamesPlayed || 0) + 1;
      if (totalGames >= 10 && !userData.achievements?.includes('games_10')) {
        newAchievements.push('games_10');
      }
      if (totalGames >= 50 && !userData.achievements?.includes('games_50')) {
        newAchievements.push('games_50');
      }
      if (totalGames >= 100 && !userData.achievements?.includes('games_100')) {
        newAchievements.push('games_100');
      }

      // Score achievements
      if (gameStats.bestScore >= 1000 && !userData.achievements?.includes('score_1000')) {
        newAchievements.push('score_1000');
      }
      if (gameStats.bestScore >= 5000 && !userData.achievements?.includes('score_5000')) {
        newAchievements.push('score_5000');
      }

      // Add new achievements if any
      if (newAchievements.length > 0) {
        await updateDoc(doc(db, 'users', uid), {
          achievements: arrayUnion(...newAchievements),
          lastAchievement: new Date().toISOString()
        });
      }

      return newAchievements;
    } catch (error) {
      console.error('PlayerProfileService: Failed to check achievements:', error);
      throw error;
    }
  }

  // Update social connections
  async addFriend(uid, friendUid) {
    try {
      // Add friend to user's friend list
      await updateDoc(doc(db, 'users', uid), {
        friends: arrayUnion(friendUid)
      });

      // Add user to friend's friend list (reciprocal)
      await updateDoc(doc(db, 'users', friendUid), {
        friends: arrayUnion(uid)
      });

      return true;
    } catch (error) {
      console.error('PlayerProfileService: Failed to add friend:', error);
      throw error;
    }
  }

  async removeFriend(uid, friendUid) {
    try {
      // Remove friend from user's friend list
      await updateDoc(doc(db, 'users', uid), {
        friends: arrayRemove(friendUid)
      });

      // Remove user from friend's friend list
      await updateDoc(doc(db, 'users', friendUid), {
        friends: arrayRemove(uid)
      });

      return true;
    } catch (error) {
      console.error('PlayerProfileService: Failed to remove friend:', error);
      throw error;
    }
  }

  // Update game preferences
  async updateGamePreferences(uid, preferences) {
    try {
      const updates = {
        ...preferences,
        lastUpdated: new Date().toISOString()
      };

      await updateDoc(doc(db, 'users', uid), updates);
      return true;
    } catch (error) {
      console.error('PlayerProfileService: Failed to update game preferences:', error);
      throw error;
    }
  }

  // Get leaderboard data
  async getLeaderboardData(limit = 50) {
    try {
      // This would typically use a Firestore query with ordering
      // For now, we'll return a placeholder structure
      return {
        topPlayers: [],
        userRank: null,
        totalPlayers: 0
      };
    } catch (error) {
      console.error('PlayerProfileService: Failed to get leaderboard data:', error);
      throw error;
    }
  }

  // Get achievement definitions
  getAchievementDefinitions() {
    return {
      first_win: {
        title: 'First Victory',
        description: 'Win your first game',
        icon: '🏆',
        points: 10
      },
      streak_3: {
        title: 'Hot Streak',
        description: 'Win 3 games in a row',
        icon: '🔥',
        points: 25
      },
      streak_5: {
        title: 'Unstoppable',
        description: 'Win 5 games in a row',
        icon: '⚡',
        points: 50
      },
      streak_10: {
        title: 'Legendary',
        description: 'Win 10 games in a row',
        icon: '👑',
        points: 100
      },
      games_10: {
        title: 'Dedicated Player',
        description: 'Play 10 games',
        icon: '🎮',
        points: 15
      },
      games_50: {
        title: 'Veteran',
        description: 'Play 50 games',
        icon: '🎯',
        points: 40
      },
      games_100: {
        title: 'Master',
        description: 'Play 100 games',
        icon: '🌟',
        points: 75
      },
      score_1000: {
        title: 'High Scorer',
        description: 'Achieve a score of 1000',
        icon: '💎',
        points: 30
      },
      score_5000: {
        title: 'Ultimate Scorer',
        description: 'Achieve a score of 5000',
        icon: '💫',
        points: 100
      }
    };
  }

  // Calculate player level based on total score
  calculatePlayerLevel(totalScore) {
    const levelThresholds = [
      0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000
    ];
    
    for (let i = levelThresholds.length - 1; i >= 0; i--) {
      if (totalScore >= levelThresholds[i]) {
        return {
          level: i + 1,
          currentScore: totalScore,
          nextLevelScore: levelThresholds[i + 1] || levelThresholds[i],
          progress: levelThresholds[i + 1] ? 
            ((totalScore - levelThresholds[i]) / (levelThresholds[i + 1] - levelThresholds[i])) * 100 : 100
        };
      }
    }
    
    return { level: 1, currentScore: totalScore, nextLevelScore: 100, progress: 0 };
  }

  // Get player statistics summary
  async getPlayerStats(uid) {
    try {
      const profile = await this.getUserProfile(uid);
      if (!profile) return null;

      const levelInfo = this.calculatePlayerLevel(profile.totalScore || 0);
      const achievements = this.getAchievementDefinitions();
      
      const earnedAchievements = (profile.achievements || []).map(achievementId => ({
        id: achievementId,
        ...achievements[achievementId]
      }));

      const totalAchievementPoints = earnedAchievements.reduce((sum, achievement) => sum + achievement.points, 0);

      return {
        ...profile,
        levelInfo,
        earnedAchievements,
        totalAchievementPoints,
        winRate: profile.gamesPlayed > 0 ? 
          Math.round((profile.gamesWon / profile.gamesPlayed) * 100) : 0
      };
    } catch (error) {
      console.error('PlayerProfileService: Failed to get player stats:', error);
      throw error;
    }
  }

  // Calculate and update rolling averages for the last 15 games per difficulty level
  async updateDifficultyRollingAverages(uid, difficulty, newScore) {
    try {
      
      // Use a simpler query that doesn't require a composite index
      // Get all games for this user and difficulty, then filter and sort in memory
      const leaderboardQuery = query(
        collection(db, 'leaderboard'),
        where('userId', '==', uid),
        where('mode', '==', 'solo')
        // Removed difficulty filter and orderBy to avoid index requirements
      );
      
      const leaderboardSnapshot = await getDocs(leaderboardQuery);
      const allGames = leaderboardSnapshot.docs.map(doc => doc.data());
      
      // Filter by difficulty and sort by timestamp in memory
      const difficultyGames = allGames
        .filter(game => game.difficulty === difficulty)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 15); // Take last 15 games
      
      // Add the current game score
      difficultyGames.unshift({
        guesses: newScore,
        timestamp: new Date().toISOString()
      });
      
      // Keep only the last 15 games
      const last15Games = difficultyGames.slice(0, 15);
      
      // Calculate rolling average
      const totalAttempts = last15Games.reduce((sum, game) => sum + game.guesses, 0);
      const rollingAverage = totalAttempts / last15Games.length;
      
      
      // Update the user profile with the new rolling average
      const difficultyField = `${difficulty}AverageScore`;
      await updateDoc(doc(db, 'users', uid), {
        [difficultyField]: rollingAverage,
        [`${difficulty}GamesCount`]: last15Games.length,
        lastUpdated: new Date().toISOString()
      });
      
      
      return rollingAverage;
    } catch (error) {
      console.error(`PlayerProfileService: Failed to update ${difficulty} rolling averages:`, error);
      
      // If the query fails due to index issues, try a fallback approach
      if (error.message && error.message.includes('requires an index')) {
        try {
          // Fallback: Just update the user profile with a basic average
          // This won't be a rolling average but will prevent the error
          const difficultyField = `${difficulty}AverageScore`;
          await updateDoc(doc(db, 'users', uid), {
            [difficultyField]: newScore, // Use current score as fallback
            [`${difficulty}GamesCount`]: 1, // Mark as 1 game
            lastUpdated: new Date().toISOString()
          });
          return newScore;
        } catch (fallbackError) {
          console.error(`PlayerProfileService: Fallback also failed for ${difficulty} difficulty:`, fallbackError);
        }
      }
      
      throw error;
      return 0;
    }
  }

  // Calculate and update PvP rolling averages for the last 15 games per difficulty level
  async updatePvpDifficultyRollingAverages(uid, difficulty, isWin) {
    try {
      
      // Use a simpler query that doesn't require a composite index
      const gameStatsQuery = query(
        collection(db, 'gameStats'),
        where('players', 'array-contains', uid),
        where('type', '==', 'pvp')
        // Removed difficulty filter and orderBy to avoid index requirements
      );
      
      const gameStatsSnapshot = await getDocs(gameStatsQuery);
      const allGames = gameStatsSnapshot.docs.map(doc => doc.data());
      
      // Filter by difficulty and sort by timestamp in memory (same logic as Leaderboard)
      const difficultyGames = allGames
        .filter(game => {
          if (!game) return false;
          // Prefer wordLength if available (new format)
          if (game.wordLength !== undefined) {
            if (difficulty === 'easy') return game.wordLength === 4;
            if (difficulty === 'hard') return game.wordLength === 6;
            return game.wordLength === 5; // regular
          }
          // Fallback to difficulty string (legacy)
          if (game.difficulty !== undefined) {
            if (difficulty === 'easy') return game.difficulty === 'easy';
            if (difficulty === 'hard') return game.difficulty === 'hard';
            return game.difficulty === 'regular';
          }
          return false;
        })
        .sort((a, b) => new Date(b.completedAt || b.timestamp) - new Date(a.completedAt || a.timestamp))
        .slice(0, 15); // Take last 15 games
      
      // Add the current game result
      difficultyGames.unshift({
        isWin: isWin,
        completedAt: new Date().toISOString()
      });
      
      // Keep only the last 15 games
      const last15Games = difficultyGames.slice(0, 15);
      
      // Calculate rolling win percentage
      const wins = last15Games.filter(game => game.isWin).length;
      const winPercentage = (wins / last15Games.length) * 100;
      
      
      // Update the user profile with the new rolling win percentage
      const difficultyField = `${difficulty}PvpWinPercentage`;
      await updateDoc(doc(db, 'users', uid), {
        [difficultyField]: winPercentage,
        [`${difficulty}PvpGamesCount`]: last15Games.length,
        lastUpdated: new Date().toISOString()
      });
      
      
      return winPercentage;
    } catch (error) {
      console.error(`PlayerProfileService: Failed to update PvP ${difficulty} rolling averages:`, error);
      
      // If the query fails due to index issues, try a fallback approach
      if (error.message && error.message.includes('requires an index')) {
        try {
          // Fallback: Just update the user profile with a basic win percentage
          const difficultyField = `${difficulty}PvpWinPercentage`;
          const winPercentage = isWin ? 100 : 0;
          await updateDoc(doc(db, 'users', uid), {
            [difficultyField]: winPercentage,
            [`${difficulty}PvpGamesCount`]: 1,
            lastUpdated: new Date().toISOString()
          });
          return winPercentage;
        } catch (fallbackError) {
          console.error(`PlayerProfileService: Fallback also failed for PvP ${difficulty} difficulty:`, fallbackError);
        }
      }
      
      throw error;
      return 0;
    }
  }
}

export default new PlayerProfileService();
