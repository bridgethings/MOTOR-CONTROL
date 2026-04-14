/**
 * Gzip Build Script
 * Compresses all Vite build output files and copies them to the
 * Arduino LittleFS data directory for ESP32 upload.
 *
 * Usage: node scripts/gzip-build.js
 * (Called automatically by: npm run build:gzip)
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST_DIR = path.resolve(__dirname, '../dist');
const DATA_DIR = path.resolve(__dirname, '../../data/www');

let totalOriginal = 0;
let totalGzipped = 0;
let fileCount = 0;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function processDirectory(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      ensureDir(destPath);
      processDirectory(srcPath, destPath);
    } else {
      const content = fs.readFileSync(srcPath);
      const gzipped = zlib.gzipSync(content, { level: 9 });

      const gzPath = destPath + '.gz';
      ensureDir(path.dirname(gzPath));
      fs.writeFileSync(gzPath, gzipped);

      totalOriginal += content.length;
      totalGzipped += gzipped.length;
      fileCount++;

      const ratio = ((1 - gzipped.length / content.length) * 100).toFixed(1);
      const relPath = path.relative(DIST_DIR, srcPath);
      console.log(`  ${relPath} (${(content.length / 1024).toFixed(1)} KB -> ${(gzipped.length / 1024).toFixed(1)} KB, -${ratio}%)`);
    }
  }
}

// Main
console.log('Gzipping build output for LittleFS...\n');

if (!fs.existsSync(DIST_DIR)) {
  console.error('Error: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Clean destination
if (fs.existsSync(DATA_DIR)) {
  fs.rmSync(DATA_DIR, { recursive: true });
}
ensureDir(DATA_DIR);

processDirectory(DIST_DIR, DATA_DIR);

console.log(`\nDone! ${fileCount} files compressed.`);
console.log(`  Original: ${(totalOriginal / 1024).toFixed(1)} KB`);
console.log(`  Gzipped:  ${(totalGzipped / 1024).toFixed(1)} KB`);
console.log(`  Savings:  ${((1 - totalGzipped / totalOriginal) * 100).toFixed(1)}%`);
console.log(`\nOutput: ${DATA_DIR}`);
console.log('Upload to ESP32 using "ESP32 Sketch Data Upload" or mklittlefs tool.');
