/**
 * Migration Script: Move Friends from Array to Subcollection
 * 
 * This script migrates existing friend relationships from the old system
 * (userData.friends array) to the new subcollection system
 * (users/{userId}/friends/{friendId})
 * 
 * Run this ONCE before deploying the new friend system code.
 * 
 * Usage: node scripts/migrate-friends-to-subcollection.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../whatword-a3f4b-firebase-adminsdk-fbsvc-8e663dc72c.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://whatword-a3f4b.firebaseio.com"
});

const db = admin.firestore();

async function migrateFriends() {
  console.log('🚀 Starting friend migration from array to subcollection...\n');
  
  let totalUsers = 0;
  let totalFriendships = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    totalUsers = usersSnapshot.size;
    console.log(`📊 Found ${totalUsers} total users\n`);
    
    // Process each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Check if user has friends in old array system
      if (!userData.friends || !Array.isArray(userData.friends) || userData.friends.length === 0) {
        continue; // Skip users with no friends
      }
      
      const username = userData.username || userData.displayName || 'Unknown';
      console.log(`\n👤 Processing user: ${username} (${userId})`);
      console.log(`   Found ${userData.friends.length} friends in old array`);
      
      let userMigrated = 0;
      let userSkipped = 0;
      
      // Process each friend in the array
      for (const friendId of userData.friends) {
        try {
          totalFriendships++;
          
          // Check if friend document already exists in new system
          const existingFriendDoc = await db
            .collection('users')
            .doc(userId)
            .collection('friends')
            .doc(friendId)
            .get();
          
          if (existingFriendDoc.exists) {
            console.log(`   ⏭️  Skipping ${friendId} - already exists in subcollection`);
            userSkipped++;
            totalSkipped++;
            continue;
          }
          
          // Get friend's username
          const friendDoc = await db.collection('users').doc(friendId).get();
          const friendData = friendDoc.exists ? friendDoc.data() : {};
          const friendUsername = friendData.username || friendData.displayName || 'Unknown';
          
          // Create friend document in current user's subcollection
          await db
            .collection('users')
            .doc(userId)
            .collection('friends')
            .doc(friendId)
            .set({
              status: 'accepted',
              friendUsername: friendUsername,
              friendId: friendId,
              createdAt: new Date().toISOString(),
              acceptedAt: new Date().toISOString(),
              migratedFrom: 'old-array-system',
              migratedAt: new Date().toISOString()
            });
          
          // Create mutual friendship in friend's subcollection
          await db
            .collection('users')
            .doc(friendId)
            .collection('friends')
            .doc(userId)
            .set({
              status: 'accepted',
              friendUsername: username,
              friendId: userId,
              createdAt: new Date().toISOString(),
              acceptedAt: new Date().toISOString(),
              migratedFrom: 'old-array-system',
              migratedAt: new Date().toISOString()
            });
          
          console.log(`   ✅ Migrated friendship: ${username} ↔️ ${friendUsername}`);
          userMigrated++;
          totalMigrated++;
          
        } catch (error) {
          console.error(`   ❌ Error migrating friend ${friendId}:`, error.message);
          totalErrors++;
        }
      }
      
      console.log(`   📊 User summary: ${userMigrated} migrated, ${userSkipped} skipped`);
    }
    
    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ MIGRATION COMPLETE!');
    console.log('='.repeat(70));
    console.log(`📊 Statistics:`);
    console.log(`   Total users processed: ${totalUsers}`);
    console.log(`   Total friendships found: ${totalFriendships}`);
    console.log(`   ✅ Successfully migrated: ${totalMigrated}`);
    console.log(`   ⏭️  Skipped (already migrated): ${totalSkipped}`);
    console.log(`   ❌ Errors: ${totalErrors}`);
    console.log('='.repeat(70));
    
    if (totalErrors === 0) {
      console.log('\n🎉 All friendships migrated successfully!');
      console.log('💡 NOTE: The old friends arrays are still in user documents.');
      console.log('   You can safely delete them later with a separate cleanup script.');
    } else {
      console.log('\n⚠️  Some errors occurred. Please review and re-run if needed.');
    }
    
  } catch (error) {
    console.error('❌ Fatal error during migration:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the migration
migrateFriends();

