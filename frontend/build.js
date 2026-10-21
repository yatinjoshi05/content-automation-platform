const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FRONTEND_DIR = __dirname;
const DIST_DIR = path.join(FRONTEND_DIR, 'dist');
const PUBLIC_DIR = path.join(FRONTEND_DIR, 'public');
const NM_DIR = path.join(FRONTEND_DIR, 'node_modules');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('--- Step 1: Compiling TypeScript ---');
const nodeBin = process.execPath || 'node';
const tscBin = path.join(NM_DIR, 'typescript', 'bin', 'tsc');
const tscRes = spawnSync(nodeBin, [tscBin, '-p', path.join(FRONTEND_DIR, 'tsconfig.json')], {
  stdio: 'inherit',
  encoding: 'utf8'
});

if (tscRes.status !== 0) {
  console.error('TypeScript compilation failed with code', tscRes.status);
  process.exit(tscRes.status ?? 1);
}

console.log('--- Step 2: Copying Assets and Vendors ---');
fs.mkdirSync(path.join(DIST_DIR, 'styles'), { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'assets'), { recursive: true });

// Ensure CoreUI CSS, Icons CSS, and Chart.js are in vendor
const coreuiCss = path.join(NM_DIR, '@coreui', 'coreui', 'dist', 'css', 'coreui.min.css');
if (fs.existsSync(coreuiCss)) {
  fs.copyFileSync(coreuiCss, path.join(PUBLIC_DIR, 'vendor', 'coreui.min.css'));
  fs.copyFileSync(coreuiCss, path.join(DIST_DIR, 'vendor', 'coreui.min.css'));
}

const iconsCss = path.join(NM_DIR, '@coreui', 'icons', 'css', 'all.min.css');
if (fs.existsSync(iconsCss)) {
  fs.copyFileSync(iconsCss, path.join(PUBLIC_DIR, 'vendor', 'coreui-icons.min.css'));
  fs.copyFileSync(iconsCss, path.join(DIST_DIR, 'vendor', 'coreui-icons.min.css'));
}

const chartJs = path.join(NM_DIR, 'chart.js', 'dist', 'chart.umd.js');
if (fs.existsSync(chartJs)) {
  fs.copyFileSync(chartJs, path.join(PUBLIC_DIR, 'vendor', 'chart.umd.js'));
  fs.copyFileSync(chartJs, path.join(DIST_DIR, 'vendor', 'chart.umd.js'));
}

// Copy styles
fs.copyFileSync(
  path.join(FRONTEND_DIR, 'src', 'styles', 'index.css'),
  path.join(DIST_DIR, 'styles', 'index.css')
);

// Copy fonts & avatars
copyDirRecursive(path.join(PUBLIC_DIR, 'fonts'), path.join(DIST_DIR, 'fonts'));
copyDirRecursive(path.join(PUBLIC_DIR, 'vendor'), path.join(DIST_DIR, 'vendor'));
copyDirRecursive(path.join(PUBLIC_DIR, 'assets'), path.join(DIST_DIR, 'assets'));

// Generate index.html
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CoreUI Free React Admin Template — Content Automation</title>
  <link rel="stylesheet" href="/vendor/coreui.min.css" />
  <link rel="stylesheet" href="/vendor/coreui-icons.min.css" />
  <link rel="stylesheet" href="/styles/index.css" />
  <script src="/vendor/chart.umd.js"></script>
  <script src="/vendor/react.production.min.js"></script>
  <script src="/vendor/react-dom.production.min.js"></script>
  <script type="importmap">
  {
    "imports": {
      "react": "/vendor/react.esm.js",
      "react-dom": "/vendor/react-dom-client.esm.js",
      "react-dom/client": "/vendor/react-dom-client.esm.js"
    }
  }
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml);
fs.writeFileSync(path.join(FRONTEND_DIR, 'index.html'), indexHtml);

console.log('Frontend build completed successfully in:', DIST_DIR);
