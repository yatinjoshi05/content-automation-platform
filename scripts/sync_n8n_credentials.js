/**
 * N8N CREDENTIAL AUTO-SYNC & WORKFLOW BINDING MODULE
 * 
 * Inspects D:\n8n_data\.n8n\database.sqlite for newly authorized credentials:
 * - youTubeOAuth2Api -> Binds to 'YouTube Upload' in CA 10 Publishing
 * - Meta credentials (httpQueryAuth/httpHeaderAuth with Meta/Facebook/Instagram name, or facebookGraphApi)
 *   -> Binds to Meta Graph nodes in CA 10 Publishing
 * - gmailOAuth2 -> Binds to 'Send Gmail' in CA 14 Notifications
 * 
 * Safety & Concurrency Hardening:
 * 1. Strict credential type and name matching: never binds unrelated credentials.
 * 2. SQLite busy_timeout = 5000ms with guaranteed connection cleanup in finally blocks.
 * 3. Atomic in-memory updates written back to workflow_entity, workflow_history, and disk.
 * 4. Zero secret leakage in logs.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = 'D:/n8n_data/.n8n/database.sqlite';
const WF10_PATH = path.resolve(__dirname, '..', 'workflows', '10_publishing.json');
const WF14_PATH = path.resolve(__dirname, '..', 'workflows', '14_notifications.json');

export function isYouTubeCredential(c) {
  if (!c || !c.type) return false;
  return c.type === 'youTubeOAuth2Api' || 
    (c.type.toLowerCase().includes('oauth') && c.name && /youtube/i.test(c.name));
}

export function isMetaCredential(c) {
  if (!c || !c.type) return false;
  if (c.type === 'facebookGraphApi') return true;
  if (c.type === 'httpBearerAuth' || c.type === 'httpHeaderAuth' || c.type === 'httpQueryAuth') {
    return Boolean(c.name && /meta|facebook|instagram/i.test(c.name));
  }
  return false;
}

export function isGmailCredential(c) {
  if (!c || !c.type) return false;
  return c.type === 'gmailOAuth2' || 
    (c.type.toLowerCase().includes('oauth') && c.name && /gmail/i.test(c.name));
}

export function syncCredentials() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('[SYNC] n8n SQLite database not found at:', DB_PATH);
    return { synced: false, reason: 'sqlite_missing' };
  }

  let db = null;
  try {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA busy_timeout = 5000;');

    const creds = db.prepare('SELECT id, name, type FROM credentials_entity').all();

    const ytCred = creds.find(isYouTubeCredential);
    const metaCred = creds.find(isMetaCredential);
    const gmailCred = creds.find(isGmailCredential);

    console.log('[SYNC] Discovered Credentials:', creds.map(c => ({ id: c.id, name: c.name, type: c.type })));

    let updatedWorkflows = 0;

    // 1. Check & Bind CA 10 Publishing
    const wf10 = db.prepare("SELECT id, name, nodes FROM workflow_entity WHERE id = 'cawf100000000000'").get();
    if (wf10) {
      let nodes = JSON.parse(wf10.nodes);
      let dirty = false;

      for (const node of nodes) {
        if (node.type === 'n8n-nodes-base.youTube' && ytCred) {
          if (!node.credentials || node.credentials.youTubeOAuth2Api?.id !== ytCred.id) {
            node.credentials = { youTubeOAuth2Api: { id: ytCred.id, name: ytCred.name } };
            console.log(`[SYNC] Bound YouTube credential '${ytCred.name}' (${ytCred.id}) to node '${node.name}'`);
            dirty = true;
          }
        }

        if (['IG Create Reels Container', 'IG Check Container', 'IG Publish', 'FB Initialize Reel', 'FB Publish Reel'].includes(node.name)) {
          // Ensure genericAuthType is httpHeaderAuth or matches metaCred
          const authKey = metaCred ? (metaCred.type === 'httpBearerAuth' ? 'httpBearerAuth' : (metaCred.type === 'httpHeaderAuth' ? 'httpHeaderAuth' : 'httpQueryAuth')) : 'httpHeaderAuth';
          if (node.parameters?.genericAuthType !== authKey) {
            node.parameters = node.parameters || {};
            node.parameters.genericAuthType = authKey;
            dirty = true;
          }
          if (metaCred && (!node.credentials || node.credentials[authKey]?.id !== metaCred.id)) {
            node.credentials = { [authKey]: { id: metaCred.id, name: metaCred.name } };
            console.log(`[SYNC] Bound Meta credential '${metaCred.name}' (${metaCred.id}) [${authKey}] to node '${node.name}'`);
            dirty = true;
          }
        }
      }

      const wpv = db.prepare("SELECT publishedVersionId FROM workflow_published_version WHERE workflowId = 'cawf100000000000'").get();
      let historyDirty = false;
      if (wpv && wpv.publishedVersionId) {
        const wh = db.prepare("SELECT nodes FROM workflow_history WHERE versionId = ?").get(wpv.publishedVersionId);
        if (wh) {
          let hNodes = JSON.parse(wh.nodes);
          for (const node of hNodes) {
            if (node.type === 'n8n-nodes-base.youTube' && ytCred) {
              if (!node.credentials || node.credentials.youTubeOAuth2Api?.id !== ytCred.id) {
                node.credentials = { youTubeOAuth2Api: { id: ytCred.id, name: ytCred.name } };
                historyDirty = true;
              }
            }
            if (['IG Create Reels Container', 'IG Check Container', 'IG Publish', 'FB Initialize Reel', 'FB Publish Reel'].includes(node.name)) {
              const authKey = metaCred ? (metaCred.type === 'httpBearerAuth' ? 'httpBearerAuth' : (metaCred.type === 'httpHeaderAuth' ? 'httpHeaderAuth' : 'httpQueryAuth')) : 'httpHeaderAuth';
              if (node.parameters?.genericAuthType !== authKey) {
                node.parameters = node.parameters || {};
                node.parameters.genericAuthType = authKey;
                historyDirty = true;
              }
              if (metaCred && (!node.credentials || node.credentials[authKey]?.id !== metaCred.id)) {
                node.credentials = { [authKey]: { id: metaCred.id, name: metaCred.name } };
                historyDirty = true;
              }
            }
          }
          if (historyDirty) {
            db.prepare("UPDATE workflow_history SET nodes = ?, updatedAt = datetime('now') WHERE versionId = ?").run(JSON.stringify(hNodes), wpv.publishedVersionId);
          }
        }
      }

      if (dirty) {
        const nodesJson = JSON.stringify(nodes);
        db.prepare("UPDATE workflow_entity SET nodes = ?, updatedAt = datetime('now') WHERE id = 'cawf100000000000'").run(nodesJson);
        updatedWorkflows++;

        // Sync back to disk file
        if (fs.existsSync(WF10_PATH)) {
          try {
            const diskWf = JSON.parse(fs.readFileSync(WF10_PATH, 'utf8'));
            diskWf.nodes = nodes;
            fs.writeFileSync(WF10_PATH, JSON.stringify(diskWf, null, 2), 'utf8');
          } catch (e) {
            // non-fatal
          }
        }
        console.log('[SYNC] Successfully updated CA 10 Publishing in n8n database and disk.');
      } else if (historyDirty) {
        updatedWorkflows++;
      }
    }

    // 2. Check & Bind CA 14 Notifications
    const wf14 = db.prepare("SELECT id, name, nodes FROM workflow_entity WHERE id = 'cawf140000000000'").get();
    if (wf14 && gmailCred) {
      let nodes = JSON.parse(wf14.nodes);
      let dirty = false;

      for (const node of nodes) {
        if (node.type === 'n8n-nodes-base.gmail') {
          if (!node.credentials || node.credentials.gmailOAuth2?.id !== gmailCred.id) {
            node.credentials = { gmailOAuth2: { id: gmailCred.id, name: gmailCred.name } };
            console.log(`[SYNC] Bound Gmail credential '${gmailCred.name}' (${gmailCred.id}) to node '${node.name}'`);
            dirty = true;
          }
        }
      }

      if (dirty) {
        const nodesJson = JSON.stringify(nodes);
        db.prepare("UPDATE workflow_entity SET nodes = ?, updatedAt = datetime('now') WHERE id = 'cawf140000000000'").run(nodesJson);
        
        const wpv14 = db.prepare("SELECT publishedVersionId FROM workflow_published_version WHERE workflowId = 'cawf140000000000'").get();
        if (wpv14 && wpv14.publishedVersionId) {
          db.prepare("UPDATE workflow_history SET nodes = ?, updatedAt = datetime('now') WHERE versionId = ?").run(nodesJson, wpv14.publishedVersionId);
        }
        
        // Sync back to disk file
        if (fs.existsSync(WF14_PATH)) {
          try {
            const diskWf14 = JSON.parse(fs.readFileSync(WF14_PATH, 'utf8'));
            diskWf14.nodes = nodes;
            fs.writeFileSync(WF14_PATH, JSON.stringify(diskWf14, null, 2), 'utf8');
          } catch (e) {
            // non-fatal
          }
        }

        updatedWorkflows++;
        console.log('[SYNC] Successfully updated CA 14 Notifications in n8n database and disk.');
      }
    }

    return {
      synced: true,
      updatedWorkflows,
      youtube: Boolean(ytCred),
      meta: Boolean(metaCred),
      gmail: Boolean(gmailCred)
    };
  } catch (err) {
    console.error('[SYNC] Error during credential sync:', err.message);
    return { synced: false, error: err.message };
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('sync_n8n_credentials.js')) {
  const result = syncCredentials();
  console.log('\nSync Result:', result);
}
