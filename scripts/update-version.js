const fs = require('fs');
const path = require('path');

// Read app.json to get current version info
const appJsonPath = path.join(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

// Get version info
const versionCode = appJson.expo.android.versionCode;
const versionName = appJson.expo.version;
const releaseDate = new Date().toISOString().split('T')[0];

// Create version data
const versionData = {
  latestBuildNumber: versionCode,
  versionCode: versionCode,
  versionName: versionName,
  releaseDate: releaseDate,
  updateMessage: "Bug fixes and improvements"
};

// Write to version.json
const versionJsonPath = path.join(__dirname, '..', 'version.json');
fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

console.log('✅ Version file updated:');
console.log(`   Build Number: ${versionCode}`);
console.log(`   Version: ${versionName}`);
console.log(`   Date: ${releaseDate}`);
console.log('');
console.log('📝 Next steps:');
console.log('1. Commit and push version.json to GitHub');
console.log('2. Build your app');
console.log('3. Upload to Google Play Console');









