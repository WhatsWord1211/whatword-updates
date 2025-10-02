import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { getThemeColors } from './theme';
import settingsService from './settingsService';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [themeColors, setThemeColors] = useState(getThemeColors('dark'));

  useEffect(() => {
    // Initialize theme from settings
    const initializeTheme = async () => {
      try {
        await settingsService.initialize();
        const theme = settingsService.getSetting('theme');
        setCurrentTheme(theme);
        setThemeColors(getThemeColors(theme));
      } catch (error) {
        console.error('Failed to initialize theme:', error);
      }
    };

    initializeTheme();

    // Listen for theme changes
    const unsubscribe = settingsService.addListener((key, value) => {
      if (key === 'theme') {
        setCurrentTheme(value);
        setThemeColors(getThemeColors(value));
      }
    });

    return unsubscribe;
  }, []);

  // Keep Android system navigation bar in sync with app theme/background
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const backgroundColor = themeColors.background || '#1F2937';
        const useLightButtons = (currentTheme === 'dark');
        await NavigationBar.setBackgroundColorAsync(backgroundColor);
        await NavigationBar.setButtonStyleAsync(useLightButtons ? 'light' : 'dark');
      } catch (e) {
        // Non-fatal: just log
        console.warn('ThemeContext: Failed to set Android navigation bar:', e?.message || e);
      }
    })();
  }, [currentTheme, themeColors]);

  const changeTheme = async (themeName) => {
    try {
      const success = await settingsService.updateSetting('theme', themeName);
      if (success) {
        setCurrentTheme(themeName);
        setThemeColors(getThemeColors(themeName));
      }
    } catch (error) {
      console.error('Failed to change theme:', error);
    }
  };

  const value = {
    theme: currentTheme,
    colors: themeColors,
    changeTheme,
    isDark: currentTheme === 'dark',
    isLight: currentTheme === 'light',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

