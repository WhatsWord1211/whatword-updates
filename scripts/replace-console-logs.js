#!/usr/bin/env node

// Script to replace console.log statements with proper logging
const fs = require('fs');
const path = require('path');

// Files to process (excluding node_modules and other build artifacts)
const srcDir = path.join(__dirname, '..', 'src');
const filesToProcess = [];

// Recursively find all JS files
function findJSFiles(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findJSFiles(filePath);
    } else if (file.endsWith('.js') && !file.includes('node_modules')) {
      filesToProcess.push(filePath);
    }
  }
}

findJSFiles(srcDir);

// Console log patterns to replace
const replacements = [
  // console.log -> logger.debug
  {
    pattern: /console\.log\(/g,
    replacement: 'logger.debug('
  },
  // console.error -> logger.error
  {
    pattern: /console\.error\(/g,
    replacement: 'logger.error('
  },
  // console.warn -> logger.warn
  {
    pattern: /console\.warn\(/g,
    replacement: 'logger.warn('
  },
  // console.info -> logger.info
  {
    pattern: /console\.info\(/g,
    replacement: 'logger.info('
  }
];

// Process each file
let totalReplacements = 0;

for (const filePath of filesToProcess) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let fileReplacements = 0;
    
    // Check if file already imports logger
    const hasLoggerImport = content.includes("import logger from './logger'") || 
                           content.includes('import logger from "./logger"') ||
                           content.includes("import { logger } from './logger'") ||
                           content.includes('import { logger } from "./logger"');
    
    // Apply replacements
    for (const { pattern, replacement } of replacements) {
      const matches = content.match(pattern);
      if (matches) {
        content = content.replace(pattern, replacement);
        fileReplacements += matches.length;
      }
    }
    
    // Add logger import if needed and replacements were made
    if (fileReplacements > 0 && !hasLoggerImport) {
      // Find the last import statement
      const importLines = content.split('\n').filter(line => line.trim().startsWith('import'));
      if (importLines.length > 0) {
        const lastImportIndex = content.lastIndexOf(importLines[importLines.length - 1]);
        const insertIndex = content.indexOf('\n', lastImportIndex) + 1;
        content = content.slice(0, insertIndex) + "import logger from './logger';\n" + content.slice(insertIndex);
      }
    }
    
    // Write back if changes were made
    if (fileReplacements > 0) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ ${path.relative(process.cwd(), filePath)}: ${fileReplacements} replacements`);
      totalReplacements += fileReplacements;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

console.log(`\n🎉 Total replacements: ${totalReplacements} across ${filesToProcess.length} files`);
