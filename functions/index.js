const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Cloud Function to calculate global leaderboard rankings
 * 
 * Can be called via:
 * 1. HTTP endpoint (for free plan - use external cron service)
 * 2. Scheduled trigger (requires Blaze plan)
 * 
 * Scoring Formula:
 * - Base score: Rolling average of last 20 solo games for the difficulty
 * - Activity bonus: -0.5 if played ≥1 solo game in last 3 days
 * - Activity bonus: Additional -0.5 if played ≥10 games in last 7 days (max -1.0 total)
 * - Final score = base score + activity bonuses (lower is better)
 * 
 * Requirements:
 * - Minimum 20 games in the difficulty
 * - Active within last 7 days (lastSoloActivity)
 */

// HTTP-triggered version (works on free Spark plan)
exports.calculateGlobalLeaderboard = functions.https.onRequest(async (req, res) => {
  // Optional: Add a simple secret key check for security
  const secretKey = req.query.key || req.headers['x-api-key'];
  const expectedKey = process.env.CRON_SECRET_KEY || 'whatword-leaderboard-2024-secret';
  
  if (secretKey !== expectedKey) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }
  
  try {
    console.log('Starting global leaderboard calculation...');
    
    const db = admin.firestore();
    const difficulties = ['easy', 'regular', 'hard'];
    const INACTIVITY_THRESHOLD_DAYS = 7;
    const MIN_GAMES_REQUIRED = 20;
    const ROLLING_AVERAGE_GAMES = 20;
    const ACTIVITY_BONUS_3_DAYS = -0.5;
    const ACTIVITY_BONUS_7_DAYS = -0.5;
    
    const now = admin.firestore.Timestamp.now();
    const sevenDaysAgo = admin.firestore.Timestamp.fromMillis(
      now.toMillis() - (INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
    );
    const threeDaysAgo = admin.firestore.Timestamp.fromMillis(
      now.toMillis() - (3 * 24 * 60 * 60 * 1000)
    );
    
    for (const difficulty of difficulties) {
      try {
        console.log(`Calculating global leaderboard for ${difficulty} difficulty...`);
        
        // Get all users who have played solo games in this difficulty
        const usersSnapshot = await db.collection('users')
          .where(`${difficulty}GamesCount`, '>=', MIN_GAMES_REQUIRED)
          .get();
        
        if (usersSnapshot.empty) {
          console.log(`No users found for ${difficulty} difficulty`);
          continue;
        }
        
        const leaderboardEntries = [];
        
        // Process each user
        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data();
          const userId = userDoc.id;
          
          // Get all solo games for this user, then filter by difficulty in memory
          // (avoids need for composite index)
          const leaderboardQuery = await db.collection('leaderboard')
            .where('userId', '==', userId)
            .where('mode', '==', 'solo')
            .get();
          
          if (leaderboardQuery.empty) {
            console.log(`User ${userId} has no games in leaderboard collection`);
            continue;
          }
          
          // Filter by difficulty and sort by timestamp in memory
          const allGames = leaderboardQuery.docs.map(doc => ({
            score: doc.data().score || doc.data().guesses || 0,
            timestamp: doc.data().timestamp,
            difficulty: doc.data().difficulty
          }));
          
          const difficultyGames = allGames
            .filter(game => game.difficulty === difficulty)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, ROLLING_AVERAGE_GAMES); // Take last 20 games
          
          if (difficultyGames.length < MIN_GAMES_REQUIRED) {
            console.log(`User ${userId} has only ${difficultyGames.length} games for ${difficulty}, need ${MIN_GAMES_REQUIRED}`);
            continue;
          }
          
          // Check inactivity threshold (7 days)
          // Use lastSoloActivity if available, otherwise use most recent game timestamp
          let lastSoloActivity = userData.lastSoloActivity;
          if (!lastSoloActivity && difficultyGames.length > 0) {
            // Fallback: use most recent solo game timestamp for this difficulty
            lastSoloActivity = difficultyGames[0].timestamp;
            console.log(`User ${userId} has no lastSoloActivity, using most recent game: ${lastSoloActivity}`);
          }
          
          if (!lastSoloActivity) {
            console.log(`User ${userId} has no lastSoloActivity and no games, skipping`);
            continue;
          }
          
          const lastActivityTimestamp = admin.firestore.Timestamp.fromDate(
            new Date(lastSoloActivity)
          );
          
          if (lastActivityTimestamp < sevenDaysAgo) {
            console.log(`User ${userId} is inactive (last activity: ${lastSoloActivity}), skipping`);
            continue;
          }
          
          const games = difficultyGames;
          
          // Calculate rolling average (last 20 games)
          const totalScore = games.reduce((sum, game) => sum + game.score, 0);
          const baseScore = totalScore / games.length;
          
          // Calculate activity bonuses
          let activityBonus = 0;
          
          // Check if played ≥1 solo game in last 3 days
          const recentGames = games.filter(game => {
            const gameDate = new Date(game.timestamp);
            return gameDate >= threeDaysAgo.toDate();
          });
          
          if (recentGames.length >= 1) {
            activityBonus += ACTIVITY_BONUS_3_DAYS;
          }
          
          // Check if played ≥10 games in last 7 days
          const last7DaysGames = games.filter(game => {
            const gameDate = new Date(game.timestamp);
            return gameDate >= sevenDaysAgo.toDate();
          });
          
          if (last7DaysGames.length >= 10) {
            activityBonus += ACTIVITY_BONUS_7_DAYS;
          }
          
          // Cap activity bonus at -1.0
          activityBonus = Math.max(activityBonus, -1.0);
          
          // Calculate final score (lower is better)
          const finalScore = baseScore + activityBonus;
          
          leaderboardEntries.push({
            userId: userId,
            username: userData.username || userData.displayName || 'Unknown Player',
            displayName: userData.displayName || userData.username || 'Unknown Player',
            baseScore: baseScore,
            activityBonus: activityBonus,
            finalScore: finalScore,
            gamesCount: games.length,
            lastSoloActivity: lastSoloActivity
          });
        }
        
        // Sort by final score (lower is better)
        leaderboardEntries.sort((a, b) => a.finalScore - b.finalScore);
        
        // Take top 100
        const top100 = leaderboardEntries.slice(0, 100);
        
        // Add ranks
        const rankedEntries = top100.map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));
        
        // Store in globalLeaderboard/{difficulty}
        const leaderboardRef = db.doc(`globalLeaderboard/${difficulty}`);
        await leaderboardRef.set({
          difficulty: difficulty,
          calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
          entries: rankedEntries,
          totalEligible: leaderboardEntries.length
        }, { merge: false });
        
        console.log(`Saved ${rankedEntries.length} entries for ${difficulty} difficulty`);
        
      } catch (error) {
        console.error(`Error calculating leaderboard for ${difficulty}:`, error);
        // Continue with other difficulties even if one fails
      }
    }
    
    console.log('Global leaderboard calculation completed');
    res.status(200).json({ 
      success: true, 
      message: 'Global leaderboard calculated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Global leaderboard calculation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Scheduled version (requires Blaze plan - commented out for free plan)
// Uncomment this if you upgrade to Blaze plan and comment out the HTTP version above
/*
exports.calculateGlobalLeaderboardScheduled = functions.pubsub
  .schedule('0 0 * * *') // Every day at midnight UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    // ... same calculation code as HTTP version ...
    return null;
  });
*/

