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
        
        // Set navigation bar background to match app background
        await NavigationBar.setBackgroundColorAsync(backgroundColor);
        
        // Set button style based on theme for proper contrast
        // Light theme = dark buttons, Dark theme = light buttons
        await NavigationBar.setButtonStyleAsync(useLightButtons ? 'light' : 'dark');
        
        // Additional configuration for better integration
        await NavigationBar.setVisibilityAsync('visible');
        
        console.log(`ThemeContext: Navigation bar updated for ${currentTheme} theme - background: ${backgroundColor}, buttons: ${useLightButtons ? 'light' : 'dark'}`);
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

  // Function to manually update navigation bar (useful for app startup)
  const updateNavigationBar = async () => {
    if (Platform.OS !== 'android') return;
    
    try {
      const backgroundColor = themeColors.background || '#1F2937';
      const useLightButtons = (currentTheme === 'dark');
      
      await NavigationBar.setBackgroundColorAsync(backgroundColor);
      await NavigationBar.setButtonStyleAsync(useLightButtons ? 'light' : 'dark');
      await NavigationBar.setVisibilityAsync('visible');
      
      console.log(`ThemeContext: Navigation bar manually updated for ${currentTheme} theme`);
    } catch (error) {
      console.warn('ThemeContext: Failed to manually update navigation bar:', error);
    }
  };

  const value = {
    theme: currentTheme,
    colors: themeColors,
    changeTheme,
    updateNavigationBar,
    isDark: currentTheme === 'dark',
    isLight: currentTheme === 'light',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

