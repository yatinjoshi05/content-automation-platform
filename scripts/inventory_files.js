'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const gitignorePath = path.join(ROOT, '.gitignore');
const ignorePatterns = fs.readFileSync(gitignorePath, 'utf8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

function isIgnored(relPath, isDir) {
  const norm = relPath.replace(/\\/g, '/');
  for (const pattern of ignorePatterns) {
    if (pattern.startsWith('!')) {
      const positive = pattern.slice(1);
      if (norm === positive || norm.startsWith(positive + '/')) return false;
      continue;
    }
    const cleanPat = pattern.replace(/\/$/, '');
    if (norm === cleanPat) return true;
    if (isDir && norm.startsWith(cleanPat + '/')) return true;
    if (pattern.endsWith('/') && isDir && (norm === cleanPat || norm.startsWith(cleanPat + '/'))) return true;
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      if (norm.endsWith(ext)) return true;
    }
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      if (regex.test(norm) || regex.test(path.basename(norm))) return true;
    }
    if (norm.split('/').includes(cleanPat)) return true;
  }
  return false;
}

const included = [];
const excluded = [];

function walk(dir, rel = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const entRel = rel ? `${rel}/${ent.name}` : ent.name;
    const isDir = ent.isDirectory();
    if (isIgnored(entRel, isDir)) {
      excluded.push({ path: entRel, isDir });
      continue; // Don't recurse into ignored directories
    }
    if (isDir) {
      walk(path.join(dir, ent.name), entRel);
    } else {
      included.push(entRel);
    }
  }
}

walk(ROOT);

console.log('=== UPLOAD FILE INVENTORY ===');
console.log(`Total Included Files: ${included.length}`);
console.log(`Total Excluded Paths: ${excluded.length}`);
console.log('\n--- Major Excluded Paths ---');
excluded.forEach(e => console.log(`  [EXCLUDED] ${e.path}${e.isDir ? '/' : ''}`));

console.log('\n--- Included Directory Breakdown ---');
const dirCounts = {};
included.forEach(f => {
  const top = f.includes('/') ? f.split('/')[0] + '/' : '(root)';
  dirCounts[top] = (dirCounts[top] || 0) + 1;
});
Object.entries(dirCounts).sort().forEach(([d, c]) => console.log(`  ${d.padEnd(20)}: ${c} files`));
