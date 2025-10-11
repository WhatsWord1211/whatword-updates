import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

/**
 * FriendRecordsService - Manages head-to-head PvP records between friends
 * 
 * Stores records in: users/{userId}/friendRecords/{friendId}
 * 
 * Structure:
 * {
 *   wins: number,
 *   losses: number,
 *   ties: number,
 *   totalGames: number,
 *   lastPlayedAt: timestamp
 * }
 */

class FriendRecordsService {
  /**
   * Update head-to-head record after a PvP game completes
   * @param {string} player1Id - First player's UID
   * @param {string} player2Id - Second player's UID
   * @param {string|null} winnerId - Winner's UID (null if tie)
   * @param {boolean} isTie - Whether the game was a tie
   */
  async updateGameRecord(player1Id, player2Id, winnerId, isTie) {
    try {
      console.log('FriendRecordsService: Updating game record', { player1Id, player2Id, winnerId, isTie });
      
      const timestamp = new Date().toISOString();
      
      // Update player1's record against player2
      await this.updatePlayerRecord(player1Id, player2Id, {
        won: !isTie && winnerId === player1Id,
        lost: !isTie && winnerId === player2Id,
        tied: isTie,
        timestamp
      });
      
      // Update player2's record against player1
      await this.updatePlayerRecord(player2Id, player1Id, {
        won: !isTie && winnerId === player2Id,
        lost: !isTie && winnerId === player1Id,
        tied: isTie,
        timestamp
      });
      
      console.log('FriendRecordsService: Game record updated successfully');
      return true;
    } catch (error) {
      console.error('FriendRecordsService: Failed to update game record:', error);
      return false;
    }
  }

  /**
   * Update a single player's record against a friend
   */
  async updatePlayerRecord(playerId, friendId, { won, lost, tied, timestamp }) {
    try {
      console.log('FriendRecordsService: Updating player record', { playerId, friendId, won, lost, tied });
      
      const recordRef = doc(db, `users/${playerId}/friendRecords/${friendId}`);
      const recordSnap = await getDoc(recordRef);
      
      if (recordSnap.exists()) {
        // Update existing record
        const updateData = {
          totalGames: increment(1),
          lastPlayedAt: timestamp
        };
        
        if (won) updateData.wins = increment(1);
        if (lost) updateData.losses = increment(1);
        if (tied) updateData.ties = increment(1);
        
        console.log('FriendRecordsService: Updating existing record with:', updateData);
        await updateDoc(recordRef, updateData);
        console.log('FriendRecordsService: Existing record updated');
      } else {
        // Create new record
        const newRecord = {
          wins: won ? 1 : 0,
          losses: lost ? 1 : 0,
          ties: tied ? 1 : 0,
          totalGames: 1,
          lastPlayedAt: timestamp
        };
        console.log('FriendRecordsService: Creating new record with:', newRecord);
        await setDoc(recordRef, newRecord);
        console.log('FriendRecordsService: New record created');
      }
    } catch (error) {
      console.error('FriendRecordsService: Failed to update player record:', error);
      console.error('FriendRecordsService: Error code:', error.code, 'message:', error.message);
      throw error;
    }
  }

  /**
   * Get head-to-head record between current user and a friend
   * @param {string} userId - Current user's UID
   * @param {string} friendId - Friend's UID
   * @returns {Object} Record with wins, losses, ties, totalGames
   */
  async getFriendRecord(userId, friendId) {
    try {
      const recordRef = doc(db, `users/${userId}/friendRecords/${friendId}`);
      const recordSnap = await getDoc(recordRef);
      
      if (recordSnap.exists()) {
        return recordSnap.data();
      } else {
        // No games played yet
        return {
          wins: 0,
          losses: 0,
          ties: 0,
          totalGames: 0,
          lastPlayedAt: null
        };
      }
    } catch (error) {
      console.error('FriendRecordsService: Failed to get friend record:', error);
      // Return default record on error
      return {
        wins: 0,
        losses: 0,
        ties: 0,
        totalGames: 0,
        lastPlayedAt: null
      };
    }
  }

  /**
   * Get records for multiple friends at once (batch operation)
   * @param {string} userId - Current user's UID
   * @param {Array<string>} friendIds - Array of friend UIDs
   * @returns {Object} Map of friendId -> record
   */
  async getBatchFriendRecords(userId, friendIds) {
    try {
      const recordsMap = {};
      
      // Fetch all records in parallel for efficiency
      const recordPromises = friendIds.map(async (friendId) => {
        const record = await this.getFriendRecord(userId, friendId);
        return { friendId, record };
      });
      
      const results = await Promise.all(recordPromises);
      
      results.forEach(({ friendId, record }) => {
        recordsMap[friendId] = record;
      });
      
      return recordsMap;
    } catch (error) {
      console.error('FriendRecordsService: Failed to get batch friend records:', error);
      return {};
    }
  }

  /**
   * Format record for display
   * @param {Object} record - Record object with wins, losses, ties
   * @returns {string} Formatted string like "3-1-0" or "0-0-0"
   */
  formatRecord(record) {
    if (!record) return '0-0-0';
    const wins = record.wins || 0;
    const losses = record.losses || 0;
    const ties = record.ties || 0;
    return `${wins}-${losses}-${ties}`;
  }
}

// Export singleton instance
const friendRecordsService = new FriendRecordsService();
export default friendRecordsService;

