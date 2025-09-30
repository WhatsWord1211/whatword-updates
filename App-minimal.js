import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/firebase';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('Minimal App: Starting...');
    
    // Simple auth state listener
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Minimal App: Auth state changed, user:', user ? 'logged in' : 'logged out');
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error.message}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {user ? `Welcome ${user.email}` : 'Please log in'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 18,
    color: '#000',
  },
  errorText: {
    fontSize: 18,
    color: '#ff0000',
  },
});





