import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Badge definitions
const BADGES = [
  {
    id: 'quick-solver',
    name: 'Quick Solver',
    description: 'Win a game in 5 or fewer guesses',
    icon: '🏆',
  },
  {
    id: 'novice',
    name: 'Novice',
    description: 'Complete 5 games in any mode',
    icon: '🎓',
  },
  {
    id: 'pvp-victor',
    name: 'PvP Victor',
    description: 'Win 3 games against the same opponent',
    icon: '⚔️',
  },
];

// Export badge metadata
export const getBadges = () => BADGES;

// Check badge conditions
export const checkBadgeConditions = async ({ guesses, completedGames, gameMode, opponentId, playerId, earnedBadges, db, auth }) => {
  const newBadges = [];

  if (!playerId || !db || !auth) {
    console.warn('badges.js: Missing required parameters for badge check', { playerId, db: !!db, auth: !!auth });
    return newBadges;
  }

  // Quick Solver: Win in 5 or fewer guesses
  if (!earnedBadges.includes('quick-solver') && guesses.some(g => g.isCorrect) && guesses.length <= 5) {
    newBadges.push('quick-solver');
  }

  // Novice: Complete 5 games
  if (!earnedBadges.includes('novice') && completedGames >= 5) {
    newBadges.push('novice');
  }

  // PvP Victor: Win 3 games against the same opponent
  if (gameMode === 'pvp' && playerId && opponentId && !earnedBadges.includes('pvp-victor') && guesses.some(g => g.isCorrect)) {
    try {
      if (auth.currentUser && playerId === auth.currentUser.uid) {
        const opponentWinsRef = doc(db, `users/${playerId}/opponentWins`, opponentId);
        await setDoc(opponentWinsRef, { wins: increment(1) }, { merge: true });
        const opponentWinsDoc = await getDoc(opponentWinsRef);
        const wins = opponentWinsDoc.exists() ? opponentWinsDoc.data().wins : 0;
        if (wins >= 3) {
          newBadges.push('pvp-victor');
        }
      } else {
        console.warn('badges.js: No valid auth, skipping PvP Victor badge check');
      }
    } catch (error) {
      console.warn('badges.js: Failed to update opponent wins in Firestore', error);
    }
  }

  // Save new badges to AsyncStorage and Firestore
  if (newBadges.length > 0) {
    try {
      const existingBadges = await AsyncStorage.getItem('earnedBadges');
      const updatedBadges = [...new Set([...(existingBadges ? JSON.parse(existingBadges) : []), ...newBadges])];
      await AsyncStorage.setItem('earnedBadges', JSON.stringify(updatedBadges));
      if (playerId && auth.currentUser && playerId === auth.currentUser.uid) {
        for (const badgeId of newBadges) {
          try {
            await setDoc(doc(db, `users/${playerId}/badges`, badgeId), { earned: true, earnedAt: new Date().toISOString() });
            console.log('badges.js: Saved badge to Firestore', { badgeId });
          } catch (error) {
            console.warn('badges.js: Failed to save badge to Firestore', { badgeId, error });
          }
        }
      }
    } catch (error) {
      console.error('badges.js: Failed to save badges to AsyncStorage', error);
    }
  }

  return newBadges;
};