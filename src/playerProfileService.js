import { doc, getDoc, updateDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
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

      // Update average score
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
}

export default new PlayerProfileService();
