import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const localAppData = process.env.LOCALAPPDATA || '';
const appData = process.env.APPDATA || '';

const nodePath = process.env.NODE24_HOME || (localAppData ? path.join(localAppData, 'nvm', 'v24.18.0') : '');
const n8nBin = process.env.N8N_BIN || (appData ? path.join(appData, 'npm', 'node_modules', 'n8n', 'bin', 'n8n') : 'n8n');
const nodeExe = nodePath && fs.existsSync(path.join(nodePath, 'node.exe')) ? path.join(nodePath, 'node.exe') : process.execPath;


const env = {
  ...process.env,
  PATH: `${nodePath};${process.env.PATH}`,
  N8N_USER_FOLDER: 'D:\\n8n_data',
  N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',
  NODE_FUNCTION_ALLOW_BUILTIN: 'crypto',
  GENERIC_TIMEZONE: 'Asia/Kolkata',
  TZ: 'Asia/Kolkata',
  EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'none',
  N8N_LISTEN_ADDRESS: '0.0.0.0',
  N8N_PORT: '5678'
};

console.log('Spawning n8n process...');
const child = spawn(path.join(nodePath, 'node.exe'), [n8nBin, 'start'], {
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  console.log(`n8n exited with code ${code}, signal ${signal}`);
  process.exit(code ?? 1);
});
