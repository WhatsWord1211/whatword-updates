/**
 * Migration script to set lastSoloActivity for existing users
 * 
 * This script:
 * 1. Finds all users who have played solo games but don't have lastSoloActivity set
 * 2. Sets lastSoloActivity to their most recent solo game timestamp
 * 
 * Usage: node migrate-lastSoloActivity.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (you may need to set up credentials)
// For local testing, you might need to set GOOGLE_APPLICATION_CREDENTIALS
// Or use service account key file
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('Firebase initialization error:', error);
    process.exit(1);
  }
}

const db = admin.firestore();

async function migrateLastSoloActivity() {
  console.log('🔄 Starting migration of lastSoloActivity for existing users...\n');
  
  let totalUsers = 0;
  let usersUpdated = 0;
  let usersSkipped = 0;
  let errors = 0;
  
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    totalUsers = usersSnapshot.size;
    console.log(`📊 Found ${totalUsers} total users\n`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Skip if user already has lastSoloActivity
      if (userData.lastSoloActivity) {
        usersSkipped++;
        continue;
      }
      
      try {
        // Get all solo games for this user
        const leaderboardQuery = await db.collection('leaderboard')
          .where('userId', '==', userId)
          .where('mode', '==', 'solo')
          .get();
        
        if (leaderboardQuery.empty) {
          // User has no solo games, skip
          usersSkipped++;
          continue;
        }
        
        // Find most recent solo game
        const allGames = leaderboardQuery.docs.map(doc => ({
          timestamp: doc.data().timestamp
        }));
        
        // Sort by timestamp (most recent first)
        allGames.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        if (allGames.length > 0) {
          const mostRecentGame = allGames[0];
          const lastSoloActivity = mostRecentGame.timestamp;
          
          // Update user document
          await db.collection('users').doc(userId).update({
            lastSoloActivity: lastSoloActivity
          });
          
          usersUpdated++;
          console.log(`✅ Updated user ${userId} (${userData.username || userData.displayName || 'Unknown'}) - lastSoloActivity: ${lastSoloActivity}`);
        } else {
          usersSkipped++;
        }
      } catch (error) {
        errors++;
        console.error(`❌ Error processing user ${userId}:`, error.message);
      }
    }
    
    console.log('\n📈 Migration Summary:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Users updated: ${usersUpdated}`);
    console.log(`   Users skipped: ${usersSkipped}`);
    console.log(`   Errors: ${errors}`);
    console.log('\n✅ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateLastSoloActivity()
  .then(() => {
    console.log('\n🎉 Migration script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });

