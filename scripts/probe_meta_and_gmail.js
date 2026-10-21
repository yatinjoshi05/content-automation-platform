/**
 * Autonomous Probe for Meta Graph API & Gmail Integrations (Secured & Hardened)
 *
 * Checks for live credentials, probes official APIs securely in-memory,
 * and reports genuine API readiness without fabricating success.
 *
 * Security & Reliability Guarantees:
 * 1. Strict credential filtering: never matches unrelated credentials.
 * 2. SQLite concurrency: uses PRAGMA busy_timeout = 5000 and guaranteed db.close() in finally.
 * 3. Ephemeral decryption: tokens decrypted only in memory during probe, never logged, persisted, or exported.
 * 4. Header-based transmission: Bearer tokens passed via headers, never query strings.
 * 5. Full secret redaction on all console outputs, error traces, and API responses.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', 'config', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  }
}
loadEnv();

function redact(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/(["']?(?:password|client_secret|access_token|refresh_token|queryParameterValue)["']?\s*[:=]\s*["']?)([^"'}\s,]+)(["']?)/gi, '$1[REDACTED]$3')
    .replace(/EA[A-Za-z0-9_]{16,}/g, '[REDACTED_META_TOKEN]')
    .replace(/ya29\.[0-9A-Za-z-_]+/g, '[REDACTED_OAUTH_TOKEN]')
    .replace(/GOCSPX-[0-9A-Za-z-_]+/g, '[REDACTED_GOOGLE_SECRET]');
}

function getKeyAndIv(salt, key) {
  const password = Buffer.concat([Buffer.from(key, 'binary'), salt]);
  const hash1 = crypto.createHash('md5').update(password).digest();
  const hash2 = crypto.createHash('md5').update(Buffer.concat([hash1, password])).digest();
  const iv = crypto.createHash('md5').update(Buffer.concat([hash2, password])).digest();
  return [Buffer.concat([hash1, hash2]), iv];
}

function decryptCredential(data, key) {
  try {
    const input = Buffer.from(data, 'base64');
    if (input.length < 16) return '';
    const salt = input.subarray(8, 16);
    const [derivedKey, iv] = getKeyAndIv(salt, key);
    const contents = input.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
    return Buffer.concat([decipher.update(contents), decipher.final()]).toString('utf-8');
  } catch (err) {
    return '';
  }
}

function isMetaCredential(c) {
  if (!c || !c.type) return false;
  if (c.type === 'facebookGraphApi') return true;
  if (c.type === 'httpBearerAuth' || c.type === 'httpHeaderAuth' || c.type === 'httpQueryAuth') {
    return Boolean(c.name && /meta|facebook|instagram/i.test(c.name));
  }
  return false;
}

function isGmailCredential(c) {
  if (!c || !c.type) return false;
  return c.type === 'gmailOAuth2' || 
    (c.type.toLowerCase().includes('oauth') && c.name && /gmail/i.test(c.name));
}

async function probeMeta(creds, encryptionKey) {
  console.log('--- PROBING META GRAPH API (INSTAGRAM & FACEBOOK) ---');
  const metaCred = creds.find(isMetaCredential);

  if (!metaCred || !metaCred.data) {
    console.log('Status: BLOCKED');
    console.log('Reason: No Meta credential found in n8n credentials database.');
    console.log('Required Action: Owner must configure Meta Access Token in n8n (Header Auth: Authorization: Bearer <token> or Bearer Auth).');
    return { status: 'BLOCKED', reason: 'missing_credential' };
  }

  try {
    const plain = decryptCredential(metaCred.data, encryptionKey);
    const cred = JSON.parse(plain);
    const token = cred.queryParameterValue || cred.value || cred.token || cred.access_token;
    if (!token) {
      console.log('Status: BLOCKED');
      console.log('Reason: Decrypted Meta credential has no access token string.');
      return { status: 'BLOCKED', reason: 'empty_token' };
    }

    const cleanToken = String(token).trim().replace(/^Bearer\s+/i, '');
    const res = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name,accounts{id,name,access_token,tasks,instagram_business_account{id,username}}', {
      headers: { Authorization: `Bearer ${cleanToken}` }
    });
    const data = await res.json();

    if (data.error) {
      console.log('Status: BLOCKED');
      console.log('Meta API Error:', redact(data.error.message));
      return { status: 'BLOCKED', error: data.error };
    }

    console.log('Status: VERIFIED');
    console.log('User Name:', data.name);
    console.log('Accounts Found:', data.accounts?.data?.length || 0);
    return { status: 'VERIFIED', data };
  } catch (err) {
    console.log('Status: BLOCKED (Probe error:', redact(err.message), ')');
    return { status: 'BLOCKED', error: err.message };
  }
}

async function probeGmail(creds, encryptionKey) {
  console.log('\n--- PROBING GMAIL OPERATIONAL ALERTS ---');
  const gmailCred = creds.find(isGmailCredential);

  if (!gmailCred || !gmailCred.data) {
    console.log('Status: BLOCKED');
    console.log('Reason: No Gmail OAuth2 credential found in n8n credentials database.');
    console.log('Required Action: Owner must connect Gmail OAuth2 in n8n.');
    return { status: 'BLOCKED', reason: 'missing_credential' };
  }

  try {
    const plain = decryptCredential(gmailCred.data, encryptionKey);
    const cred = JSON.parse(plain);
    const token = cred?.oauthTokenData?.access_token;

    if (!token) {
      console.log('Status: BLOCKED');
      console.log('Reason: Decrypted Gmail credential has no active access_token.');
      return { status: 'BLOCKED', reason: 'empty_token' };
    }

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log('Status: BLOCKED');
      console.log('Gmail API Error:', redact(errText));
      return { status: 'BLOCKED', reason: errText };
    }

    const profile = await res.json();
    console.log('Status: VERIFIED');
    console.log('Email Address:', profile.emailAddress);
    console.log('Total Messages:', profile.messagesTotal);
    return { status: 'VERIFIED', profile };
  } catch (err) {
    console.log('Status: BLOCKED (Probe error:', redact(err.message), ')');
    return { status: 'BLOCKED', error: err.message };
  }
}

async function main() {
  const n8nDataDir = process.env.N8N_USER_FOLDER || 'D:/n8n_data';
  const dbPath = path.join(n8nDataDir, '.n8n', 'database.sqlite');
  const configPath = path.join(n8nDataDir, '.n8n', 'config');

  if (!fs.existsSync(dbPath) || !fs.existsSync(configPath)) {
    console.error('n8n SQLite database or config not found.');
    process.exit(1);
  }

  let db = null;
  try {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA busy_timeout = 5000;');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const creds = db.prepare('SELECT id, type, name, data FROM credentials_entity').all();

    const metaResult = await probeMeta(creds, config.encryptionKey);
    const gmailResult = await probeGmail(creds, config.encryptionKey);

    console.log('\n--- INTEGRATION STATUS SUMMARY ---');
    console.log('Meta (Instagram & Facebook):', metaResult.status);
    console.log('Gmail Operational Alerts:   ', gmailResult.status);
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Probe execution error:', redact(err.message));
  });
}

module.exports = { probeMeta, probeGmail, isMetaCredential, isGmailCredential, redact };
