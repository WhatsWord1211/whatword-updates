// Component loading test file
// This helps identify which components are failing to load

console.log('Testing component imports...');

try {
  const HomeScreen = require('./HomeScreen');
  console.log('✓ HomeScreen loaded successfully');
} catch (error) {
  console.error('✗ HomeScreen failed to load:', error.message);
}

try {
  const GameScreen = require('./GameScreen');
  console.log('✓ GameScreen loaded successfully');
} catch (error) {
  console.error('✗ GameScreen failed to load:', error.message);
}

try {
  const HowToPlayScreen = require('./HowToPlayScreen');
  console.log('✓ HowToPlayScreen loaded successfully');
} catch (error) {
  console.error('✗ HowToPlayScreen failed to load:', error.message);
}

try {
  const LeaderboardScreen = require('./LeaderboardScreen');
  console.log('✓ LeaderboardScreen loaded successfully');
} catch (error) {
  console.error('✗ LeaderboardScreen failed to load:', error.message);
}

try {
  const FriendsScreen = require('./FriendsScreen');
  console.log('✓ FriendsScreen loaded successfully');
} catch (error) {
  console.error('✗ FriendsScreen failed to load:', error.message);
}

try {
  const AuthScreen = require('./AuthScreen');
  console.log('✓ AuthScreen loaded successfully');
} catch (error) {
  console.error('✗ AuthScreen failed to load:', error.message);
}

try {
  const firebase = require('./firebase');
  console.log('✓ Firebase loaded successfully');
} catch (error) {
  console.error('✗ Firebase failed to load:', error.message);
}

console.log('Component import test completed');
