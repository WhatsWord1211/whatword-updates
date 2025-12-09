const path = require('path');

module.exports = function(api) {
  api.cache(true);
  
  // Use absolute path to local babel-preset-expo to avoid global conflict
  const localBabelPresetExpo = path.resolve(__dirname, 'node_modules', 'expo', 'node_modules', 'babel-preset-expo');
  const localReanimatedPlugin = path.resolve(__dirname, 'node_modules', 'react-native-reanimated', 'plugin');
  
  return {
    presets: [
      [localBabelPresetExpo, { jsxRuntime: 'automatic' }]
    ],
    plugins: [
      localReanimatedPlugin,
    ],
  };
};
