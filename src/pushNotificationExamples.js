import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, TextInput, StyleSheet } from 'react-native';
import PushNotificationService from './pushNotificationService';

const PushNotificationExamples = () => {
  const [pushNotificationService] = useState(new PushNotificationService());
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [senderName, setSenderName] = useState('');
  const [challengerName, setChallengerName] = useState('');
  const [wordLength, setWordLength] = useState('5');
  const [timeLimit, setTimeLimit] = useState('60');
  const [opponentName, setOpponentName] = useState('');
  const [userScore, setUserScore] = useState('100');
  const [opponentScore, setOpponentScore] = useState('80');
  const [gameId, setGameId] = useState('');
  const [achievementName, setAchievementName] = useState('');
  const [achievementDescription, setAchievementDescription] = useState('');
  const [newRank, setNewRank] = useState('5');
  const [previousRank, setPreviousRank] = useState('10');
  const [bulkUserIds, setBulkUserIds] = useState('');
  const [maintenanceType, setMaintenanceType] = useState('scheduled');
  const [estimatedDuration, setEstimatedDuration] = useState('2 hours');
  const [promoCode, setPromoCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('2024-12-31');

  const showAlert = (title, message) => {
    Alert.alert(title, message);
  };

  const handleSendCustomNotification = async () => {
    try {
      if (!targetUserId || !title || !body) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendCustomNotification(
        targetUserId,
        title,
        body,
        { customData: 'example' },
        'custom'
      );
      
      showAlert('Success', `Custom notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send notification: ${error.message}`);
    }
  };

  const handleSendBulkNotifications = async () => {
    try {
      if (!bulkUserIds || !title || !body) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const userIds = bulkUserIds.split(',').map(id => id.trim()).filter(id => id);
      if (userIds.length === 0) {
        showAlert('Error', 'Please enter valid user IDs separated by commas');
        return;
      }

      const result = await pushNotificationService.sendBulkNotifications(
        userIds,
        title,
        body,
        { bulkData: 'example' },
        'bulk'
      );
      
      showAlert('Success', `Bulk notifications sent! Results: ${JSON.stringify(result)}`);
    } catch (error) {
      showAlert('Error', `Failed to send bulk notifications: ${error.message}`);
    }
  };

  const handleSendFriendRequestNotification = async () => {
    try {
      if (!targetUserId || !senderName) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendFriendRequestNotification(
        'current-user-id', // This would be the current user's ID
        targetUserId,
        senderName
      );
      
      showAlert('Success', `Friend request notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send friend request notification: ${error.message}`);
    }
  };

  const handleSendFriendRequestResponseNotification = async () => {
    try {
      if (!targetUserId || !senderName) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendFriendRequestResponseNotification(
        targetUserId, // Original requester
        'current-user-id', // Responder
        senderName,
        'accepted' // or 'declined'
      );
      
      showAlert('Success', `Friend request response notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send friend request response notification: ${error.message}`);
    }
  };

  const handleSendGameChallengeNotification = async () => {
    try {
      if (!targetUserId || !challengerName || !wordLength || !timeLimit) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendGameChallengeNotification(
        'current-user-id', // Challenger
        targetUserId,
        challengerName,
        parseInt(wordLength),
        parseInt(timeLimit)
      );
      
      showAlert('Success', `Game challenge notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send game challenge notification: ${error.message}`);
    }
  };

  const handleSendGameChallengeResponseNotification = async () => {
    try {
      if (!targetUserId || !senderName) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendGameChallengeResponseNotification(
        targetUserId, // Original challenger
        'current-user-id', // Responder
        senderName,
        'accepted' // or 'declined'
      );
      
      showAlert('Success', `Game challenge response notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send game challenge response notification: ${error.message}`);
    }
  };

  const handleSendGameResultNotification = async () => {
    try {
      if (!targetUserId || !opponentName || !userScore || !opponentScore || !gameId) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendGameResultNotification(
        targetUserId,
        'victory', // or 'defeat' or 'tie'
        opponentName,
        parseInt(userScore),
        parseInt(opponentScore),
        gameId
      );
      
      showAlert('Success', `Game result notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send game result notification: ${error.message}`);
    }
  };

  const handleSendTurnNotification = async () => {
    try {
      if (!targetUserId || !opponentName || !gameId) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendTurnNotification(
        targetUserId,
        opponentName,
        gameId
      );
      
      showAlert('Success', `Turn notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send turn notification: ${error.message}`);
    }
  };

  const handleSendWelcomeNotification = async () => {
    try {
      if (!targetUserId || !senderName) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendWelcomeNotification(
        targetUserId,
        senderName
      );
      
      showAlert('Success', `Welcome notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send welcome notification: ${error.message}`);
    }
  };

  const handleSendDailyReminderNotification = async () => {
    try {
      if (!targetUserId || !senderName) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendDailyReminderNotification(
        targetUserId,
        senderName
      );
      
      showAlert('Success', `Daily reminder notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send daily reminder notification: ${error.message}`);
    }
  };

  const handleSendAchievementNotification = async () => {
    try {
      if (!targetUserId || !achievementName || !achievementDescription) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendAchievementNotification(
        targetUserId,
        achievementName,
        achievementDescription
      );
      
      showAlert('Success', `Achievement notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send achievement notification: ${error.message}`);
    }
  };

  const handleSendLeaderboardUpdateNotification = async () => {
    try {
      if (!targetUserId || !senderName || !newRank || !previousRank) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const result = await pushNotificationService.sendLeaderboardUpdateNotification(
        targetUserId,
        senderName,
        parseInt(newRank),
        parseInt(previousRank)
      );
      
      if (result) {
        showAlert('Success', `Leaderboard update notification sent! Message ID: ${result}`);
      } else {
        showAlert('Info', 'No rank change detected');
      }
    } catch (error) {
      showAlert('Error', `Failed to send leaderboard update notification: ${error.message}`);
    }
  };

  const handleSendMaintenanceNotification = async () => {
    try {
      if (!bulkUserIds || !title || !body) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const userIds = bulkUserIds.split(',').map(id => id.trim()).filter(id => id);
      if (userIds.length === 0) {
        showAlert('Error', 'Please enter valid user IDs separated by commas');
        return;
      }

      const result = await pushNotificationService.sendMaintenanceNotification(
        userIds,
        title,
        body,
        maintenanceType,
        estimatedDuration
      );
      
      showAlert('Success', `Maintenance notification sent! Results: ${JSON.stringify(result)}`);
    } catch (error) {
      showAlert('Error', `Failed to send maintenance notification: ${error.message}`);
    }
  };

  const handleSendPromotionalNotification = async () => {
    try {
      if (!bulkUserIds || !title || !body) {
        showAlert('Error', 'Please fill in all required fields');
        return;
      }

      const userIds = bulkUserIds.split(',').map(id => id.trim()).filter(id => id);
      if (userIds.length === 0) {
        showAlert('Error', 'Please enter valid user IDs separated by commas');
        return;
      }

      const result = await pushNotificationService.sendPromotionalNotification(
        userIds,
        title,
        body,
        promoCode || null,
        expiryDate || null
      );
      
      showAlert('Success', `Promotional notification sent! Results: ${JSON.stringify(result)}`);
    } catch (error) {
      showAlert('Error', `Failed to send promotional notification: ${error.message}`);
    }
  };

  const handleGetNotificationStats = async () => {
    try {
      const stats = await pushNotificationService.getNotificationStats({
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
        endDate: new Date().toISOString(),
      });
      
      showAlert('Notification Stats', `Total: ${stats.total}\nBy Type: ${JSON.stringify(stats.byType)}\nBy Status: ${JSON.stringify(stats.byStatus)}`);
    } catch (error) {
      showAlert('Error', `Failed to get notification stats: ${error.message}`);
    }
  };

  const handleSendTestNotification = async () => {
    try {
      const result = await pushNotificationService.sendTestNotification(targetUserId || undefined);
      showAlert('Success', `Test notification sent! Message ID: ${result}`);
    } catch (error) {
      showAlert('Error', `Failed to send test notification: ${error.message}`);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Push Notification Service Examples</Text>
      
      {/* Custom Notification */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Custom Notification</Text>
        <TextInput
          style={styles.input}
          placeholder="Target User ID"
          value={targetUserId}
          onChangeText={setTargetUserId}
        />
        <TextInput
          style={styles.input}
          placeholder="Notification Title"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Notification Body"
          value={body}
          onChangeText={setBody}
          multiline
        />
        <TouchableOpacity style={styles.button} onPress={handleSendCustomNotification}>
          <Text style={styles.buttonText}>Send Custom Notification</Text>
        </TouchableOpacity>
      </View>

      {/* Bulk Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bulk Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="User IDs (comma-separated)"
          value={bulkUserIds}
          onChangeText={setBulkUserIds}
        />
        <TouchableOpacity style={styles.button} onPress={handleSendBulkNotifications}>
          <Text style={styles.buttonText}>Send Bulk Notifications</Text>
        </TouchableOpacity>
      </View>

      {/* Friend Request Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Friend Request Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="Sender Name"
          value={senderName}
          onChangeText={setSenderName}
        />
        <TouchableOpacity style={styles.button} onPress={handleSendFriendRequestNotification}>
          <Text style={styles.buttonText}>Send Friend Request Notification</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleSendFriendRequestResponseNotification}>
          <Text style={styles.buttonText}>Send Friend Request Response</Text>
        </TouchableOpacity>
      </View>

      {/* Game Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="Challenger Name"
          value={challengerName}
          onChangeText={setChallengerName}
        />
        <TextInput
          style={styles.input}
          placeholder="Word Length"
          value={wordLength}
          onChangeText={setWordLength}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Time Limit (seconds)"
          value={timeLimit}
          onChangeText={setTimeLimit}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.button} onPress={handleSendGameChallengeNotification}>
          <Text style={styles.buttonText}>Send Game Challenge</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleSendGameChallengeResponseNotification}>
          <Text style={styles.buttonText}>Send Challenge Response</Text>
        </TouchableOpacity>
      </View>

      {/* Game Result Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game Result Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="Opponent Name"
          value={opponentName}
          onChangeText={setOpponentName}
        />
        <TextInput
          style={styles.input}
          placeholder="User Score"
          value={userScore}
          onChangeText={setUserScore}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Opponent Score"
          value={opponentScore}
          onChangeText={setOpponentScore}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Game ID"
          value={gameId}
          onChangeText={setGameId}
        />
        <TouchableOpacity style={styles.button} onPress={handleSendGameResultNotification}>
          <Text style={styles.buttonText}>Send Game Result</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleSendTurnNotification}>
          <Text style={styles.buttonText}>Send Turn Notification</Text>
        </TouchableOpacity>
      </View>

      {/* Other Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Other Notifications</Text>
        <TouchableOpacity style={styles.button} onPress={handleSendWelcomeNotification}>
          <Text style={styles.buttonText}>Send Welcome Notification</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleSendDailyReminderNotification}>
          <Text style={styles.buttonText}>Send Daily Reminder</Text>
        </TouchableOpacity>
      </View>

      {/* Achievement Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Achievement Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="Achievement Name"
          value={achievementName}
          onChangeText={setAchievementName}
        />
        <TextInput
          style={styles.input}
          placeholder="Achievement Description"
          value={achievementDescription}
          onChangeText={setAchievementDescription}
          multiline
        />
        <TouchableOpacity style={styles.button} onPress={handleSendAchievementNotification}>
          <Text style={styles.buttonText}>Send Achievement Notification</Text>
        </TouchableOpacity>
      </View>

      {/* Leaderboard Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leaderboard Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="New Rank"
          value={newRank}
          onChangeText={setNewRank}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Previous Rank"
          value={previousRank}
          onChangeText={setPreviousRank}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.button} onPress={handleSendLeaderboardUpdateNotification}>
          <Text style={styles.buttonText}>Send Leaderboard Update</Text>
        </TouchableOpacity>
      </View>

      {/* Maintenance Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Maintenance Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="Maintenance Type"
          value={maintenanceType}
          onChangeText={setMaintenanceType}
        />
        <TextInput
          style={styles.input}
          placeholder="Estimated Duration"
          value={estimatedDuration}
          onChangeText={setEstimatedDuration}
        />
        <TouchableOpacity style={styles.button} onPress={handleSendMaintenanceNotification}>
          <Text style={styles.buttonText}>Send Maintenance Notification</Text>
        </TouchableOpacity>
      </View>

      {/* Promotional Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Promotional Notifications</Text>
        <TextInput
          style={styles.input}
          placeholder="Promo Code (optional)"
          value={promoCode}
          onChangeText={setPromoCode}
        />
        <TextInput
          style={styles.input}
          placeholder="Expiry Date (YYYY-MM-DD)"
          value={expiryDate}
          onChangeText={setExpiryDate}
        />
        <TouchableOpacity style={styles.button} onPress={handleSendPromotionalNotification}>
          <Text style={styles.buttonText}>Send Promotional Notification</Text>
        </TouchableOpacity>
      </View>

      {/* Utility Functions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Utility Functions</Text>
        <TouchableOpacity style={styles.button} onPress={handleGetNotificationStats}>
          <Text style={styles.buttonText}>Get Notification Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleSendTestNotification}>
          <Text style={styles.buttonText}>Send Test Notification</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 5,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PushNotificationExamples;
