#!/usr/bin/env node
// ONE deployment entry point (idempotent). Usage:  node deployment/deploy.js <setup|update|verify|uninstall> [--start-n8n] [--env path]
// setup/update: prerequisites -> database (create + schema + migrations + config seeds) -> n8n credentials (create missing Postgres + Internal Key)
//   -> inject credential ids into in-memory copies of every workflows/*.json -> import (stable ids => UPDATE, never duplicate) -> publish all
//   -> (optional) start n8n -> verify. Re-running is safe: nothing is duplicated; existing credentials/workflows are reconciled.
// verify: health + webhook auth + API validation + DB checks + QA worker; writes deployment/last_report.json. Exit code 1 on any FAIL.
// Uses only Node built-ins + the psql and n8n CLIs. Secrets are read from config/.env or the environment and are never written into workflow JSON.
"use strict";
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  http = require("http"),
  { spawnSync, spawn } = require("child_process");
const ROOT = path.resolve(__dirname, ".."),
  mode = process.argv[2] || "setup",
  flags = process.argv.slice(3);
const nvm24 = "C:\\Users\\H\\AppData\\Local\\nvm\\v24.18.0";
const toolDirs = [
  nvm24,
  "D:\\tools\\ffmpeg\\bin",
  "D:\\tools\\pgsql\\bin",
  "C:\\Users\\H\\AppData\\Roaming\\npm",
];
for (const td of toolDirs) {
  if (fs.existsSync(td)) {
    process.env.PATH = td + path.delimiter + process.env.PATH;
  }
}
const envFile = flags.includes("--env")
  ? flags[flags.indexOf("--env") + 1]
  : path.join(ROOT, "config", ".env");
const E = {
  ...Object.fromEntries(
    (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "")
      .split(/\r?\n/)
      .filter((l) => /^\s*[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  ),
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(DB_|N8N_|CA_|OPENSHORTS_|QA_|NOTIFY_|PSQL_|FFMPEG_|FFPROBE_)/.test(k),
    ),
  ),
};
const get = (k, d) => (E[k] !== undefined && E[k] !== "" ? E[k] : d);
const report = [];
const add = (area, status, detail) => {
  report.push({ area, status, detail });
  console.log(`${status.padEnd(5)} ${area}${detail ? " - " + detail : ""}`);
};
const run = (cmd, args, opt = {}) =>
  spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32" && !cmd.toLowerCase().endsWith(".exe"),
    env: { ...process.env, ...opt.env },
    input: opt.input,
    timeout: opt.timeout || 240000,
  });
const psql = (db, sql, file) =>
  run(
    get("PSQL_CMD", "psql"),
    [
      "-h",
      get("DB_HOST", "localhost"),
      "-p",
      get("DB_PORT", "5432"),
      "-U",
      get("DB_USER", "postgres"),
      "-d",
      db,
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      ...(file ? ["-f", file] : ["-c", sql]),
    ],
    { env: { PGPASSWORD: get("DB_PASSWORD", "") } },
  );
const n8n = (args, env) =>
  run(get("N8N_CMD", "n8n"), args, {
    env: {
      N8N_DIAGNOSTICS_ENABLED: "false",
      N8N_USER_FOLDER: get("N8N_USER_FOLDER", "D:\\n8n_data"),
      ...env,
    },
  });
const clean = (s) =>
  (s || "")
    .split("\n")
    .filter(
      (l) =>
        l &&
        !/migration|Postgres 1\d is outside|Python task runner|Initializing n8n|deprecat/i.test(
          l,
        ),
    )
    .join("\n")
    .trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (method, url, headers, body) =>
  new Promise((res) => {
    const u = new URL(url);
    const r = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: { "Content-Type": "application/json", ...headers },
        timeout: 20000,
      },
      (resp) => {
        let d = "";
        resp.on("data", (c) => (d += c));
        resp.on("end", () => res({ status: resp.statusCode, body: d }));
      },
    );
    r.on("error", (e) => res({ status: 0, body: String(e.message) }));
    r.on("timeout", () => {
      r.destroy();
      res({ status: 0, body: "timeout" });
    });
    if (body) r.write(body);
    r.end();
  });
const N8N_ENV = () => ({
  N8N_BLOCK_ENV_ACCESS_IN_NODE: "false",
  NODE_FUNCTION_ALLOW_BUILTIN: "crypto",
  OPENSHORTS_WEBHOOK_SECRET: get("OPENSHORTS_WEBHOOK_SECRET", ""),
  GENERIC_TIMEZONE: "Asia/Kolkata",
  TZ: "Asia/Kolkata",
  EXECUTIONS_DATA_SAVE_ON_SUCCESS: "none",
  N8N_LISTEN_ADDRESS: get("N8N_LISTEN_ADDRESS", "0.0.0.0"),
  N8N_PORT: new URL(get("N8N_URL", "http://localhost:5678")).port || "5678",
  N8N_USER_FOLDER: get("N8N_USER_FOLDER", "D:\\n8n_data"),
});

function prerequisites() {
  const major = +process.versions.node.split(".")[0];
  const allowNode20 =
    flags.includes("--allow-node-20") ||
    get("ALLOW_NODE_20", "false") === "true";
  if (major >= 24) {
    add("node >= 24", "PASS", "found " + process.versions.node);
  } else if (major >= 20 && allowNode20) {
    add(
      "node >= 24",
      "WARN",
      "found " +
        process.versions.node +
        " (n8n officially requires Node >= 24; allowed via ALLOW_NODE_20)",
    );
  } else {
    add(
      "node >= 24",
      "FAIL",
      "found " +
        process.versions.node +
        " (n8n requires Node >= 24. Switch to Node 24 via nvm or set ALLOW_NODE_20=true in config/.env)",
    );
  }
  for (const [n, c, a] of [
    ["psql", get("PSQL_CMD", "psql"), ["--version"]],
    ["ffmpeg", get("FFMPEG_CMD", "ffmpeg"), ["-version"]],
    ["ffprobe", get("FFPROBE_CMD", "ffprobe"), ["-version"]],
    ["n8n CLI", get("N8N_CMD", "n8n"), ["--version"]],
  ]) {
    const r = run(c, a);
    add(
      n,
      r.status === 0 ? "PASS" : "FAIL",
      r.status === 0 ? clean(r.stdout).split("\n")[0] : "not found on PATH",
    );
  }
  for (const k of [
    "DB_PASSWORD",
    "CA_INTERNAL_KEY",
    "OPENSHORTS_WEBHOOK_SECRET",
  ])
    add(
      "config " + k,
      get(k) ? "PASS" : "FAIL",
      get(k) ? "set" : "missing in config/.env",
    );
  return !report.some((r) => r.status === "FAIL");
}
function database() {
  const db = get("DB_NAME", "content_automation");
  let r = psql(
    "postgres",
    `SELECT 1 FROM pg_database WHERE datname='${db.replace(/[^\w]/g, "")}'`,
  );
  if (r.status !== 0) {
    add("database connect", "FAIL", clean(r.stderr).slice(0, 200));
    return false;
  }
  if (!r.stdout.trim()) {
    r = psql("postgres", `CREATE DATABASE ${db.replace(/[^\w]/g, "")}`);
    add("database create", r.status === 0 ? "PASS" : "FAIL", db);
    if (r.status) return false;
  } else add("database exists", "PASS", db);
  r = psql(db, null, path.join(ROOT, "database", "schema.sql"));
  add(
    "schema.sql applied (idempotent)",
    r.status === 0 ? "PASS" : "FAIL",
    r.status ? clean(r.stderr).slice(0, 300) : "",
  );
  if (r.status) return false;
  psql(
    db,
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const mdir = path.join(ROOT, "database", "migrations");
  const done = new Set(
    psql(db, "SELECT name FROM schema_migrations")
      .stdout.split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const f of fs.existsSync(mdir)
    ? fs
        .readdirSync(mdir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
    : []) {
    if (done.has(f)) continue;
    const m = psql(db, null, path.join(mdir, f));
    add("migration " + f, m.status === 0 ? "PASS" : "FAIL", "");
    if (m.status) return false;
    psql(db, `INSERT INTO schema_migrations(name) VALUES ('${f}')`);
  }
  const upd = (k, v) =>
    v &&
    psql(
      db,
      `UPDATE settings SET value=to_jsonb('${String(v).replace(/'/g, "")}'::text) WHERE key='${k}'`,
    );
  upd("n8n_webhook_base", get("N8N_URL", ""));
  upd("openshorts_base_url", get("OPENSHORTS_URL", ""));
  upd("qa_worker_url", get("QA_WORKER_URL", ""));
  upd("notify_email", get("NOTIFY_EMAIL", ""));
  add(
    "config seeded into settings",
    "PASS",
    "n8n_webhook_base, openshorts_base_url, qa_worker_url, notify_email (only if provided)",
  );
  return true;
}
const CRED = [
  ["CA Postgres", "postgres", "cacred0000000001"],
  ["CA Internal Key", "httpHeaderAuth", "cacred0000000002"],
];
function credentialMap() {
  const tmp = path.join(os.tmpdir(), "ca_creds_" + process.pid + ".json");
  const r = n8n(["export:credentials", "--all", "--output=" + tmp]);
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(tmp, "utf8"));
  } catch (e) {}
  try {
    fs.rmSync(tmp, { force: true });
  } catch (e) {}
  return Object.fromEntries(
    list.map((c) => [c.name, { id: c.id, name: c.name, type: c.type }]),
  );
}
function credentials() {
  let map = credentialMap();
  const make = [];
  if (!map["CA Postgres"])
    make.push({
      id: CRED[0][2],
      name: "CA Postgres",
      type: "postgres",
      data: {
        host: get("DB_HOST", "localhost"),
        port: +get("DB_PORT", 5432),
        database: get("DB_NAME", "content_automation"),
        user: get("DB_USER", "postgres"),
        password: get("DB_PASSWORD", ""),
        ssl: "disable",
        maxConnections: 10,
        allowUnauthorizedCerts: false,
        sshTunnel: false,
      },
    });
  if (!map["CA Internal Key"])
    make.push({
      id: CRED[1][2],
      name: "CA Internal Key",
      type: "httpHeaderAuth",
      data: { name: "X-CA-Key", value: get("CA_INTERNAL_KEY", "") },
    });
  if (make.length) {
    const f = path.join(os.tmpdir(), "ca_newcreds_" + process.pid + ".json");
    fs.writeFileSync(f, JSON.stringify(make), { mode: 0o600 });
    const r = n8n(["import:credentials", "--input=" + f]);
    fs.rmSync(f, { force: true });
    add(
      "credentials created: " + make.map((m) => m.name).join(", "),
      r.status === 0 ? "PASS" : "FAIL",
      clean(r.stdout + r.stderr)
        .split("\n")
        .pop(),
    );
    map = credentialMap();
  } else
    add(
      "credentials CA Postgres + CA Internal Key",
      "PASS",
      "already exist (not duplicated)",
    );
  for (const [n, why] of [
    ["YouTube API Key", "trend/discovery/analytics"],
    ["YouTube OAuth2", "publishing"],
    ["Gmail OAuth2", "notifications"],
    ["Gemini", "optional model"],
    ["Groq", "optional model"],
    ["Meta Graph token", "optional Instagram (gated)"],
  ])
    add(
      "credential " + n,
      map[n] ? "PASS" : "TODO",
      map[n]
        ? "found"
        : "create in n8n UI with exactly this name (" +
            why +
            "), then run update",
    );
  return map;
}
function inject(w, map) {
  // mirrors tools/assign_credentials.py
  const want = (type, name) =>
    map[name] && { [type]: { id: map[name].id, name: map[name].name } };
  for (const n of w.nodes) {
    const t = n.type,
      p = n.parameters || {},
      nm = n.name;
    let c = null;
    if (t.endsWith(".postgres")) c = want("postgres", "CA Postgres");
    else if (t.endsWith(".webhook") && p.authentication === "headerAuth")
      c = want("httpHeaderAuth", "CA Internal Key");
    else if (t.endsWith(".youTube"))
      c = want("youTubeOAuth2Api", "YouTube OAuth2");
    else if (t.endsWith(".gmail")) c = want("gmailOAuth2", "Gmail OAuth2");
    else if (t.endsWith(".httpRequest")) {
      const a = p.genericAuthType;
      if (
        nm === "Dispatch Worker" ||
        nm === "QA Worker" ||
        nm === "Original Generator Service"
      )
        c = want("httpHeaderAuth", "CA Internal Key");
      else if (nm === "Gemini") c = want("httpHeaderAuth", "Gemini");
      else if (a === "httpBearerAuth") c = want("httpBearerAuth", "Groq");
      else if (a === "httpQueryAuth")
        c = want(
          "httpQueryAuth",
          (nm.startsWith("IG ") || nm.startsWith("FB ")) ? "Meta Graph token" : "YouTube API Key",
        );
    }
    if (c) n.credentials = c;
  }
  return w;
}
function workflows(map) {
  const dir = path.join(ROOT, "workflows");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d\d_.*\.json$/.test(f))
    .sort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ca_wf_"));
  const ids = [];
  for (const f of files) {
    const w = inject(
      JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")),
      map,
    );
    if (!w.id) {
      add("workflow " + f, "FAIL", "no stable id");
      return false;
    }
    ids.push([w.id, w.name]);
    fs.writeFileSync(path.join(tmp, f), JSON.stringify(w));
  }
  const r = n8n(["import:workflow", "--separate", "--input=" + tmp]);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {}
  add(
    `workflows imported/updated (${files.length}, stable ids)`,
    r.status === 0 ? "PASS" : "FAIL",
    clean(r.stdout + r.stderr)
      .split("\n")
      .pop(),
  );
  if (r.status) return false;
  let bad = 0;
  for (const [id, name] of ids) {
    const p = n8n(["publish:workflow", "--id=" + id]);
    if (p.status) {
      bad++;
      add("publish " + name, "FAIL", clean(p.stderr).slice(0, 160));
    }
  }
  add(
    "workflows published/activated",
    bad ? "FAIL" : "PASS",
    bad ? bad + " failed" : ids.length + " of " + ids.length,
  );
  return !bad;
}
async function startN8n() {
  const url = get("N8N_URL", "http://localhost:5678");
  if ((await req("GET", url + "/healthz")).status === 200) {
    add(
      "n8n running",
      "WARN",
      "already running: RESTART it so the imported workflows take effect",
    );
    return;
  }
  const child = spawn(get("N8N_CMD", "n8n"), ["start"], {
    detached: true,
    stdio: "ignore",
    shell: process.platform === "win32",
    env: { ...process.env, ...N8N_ENV() },
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    if ((await req("GET", url + "/healthz")).status === 200) {
      add("n8n started", "PASS", url);
      return;
    }
  }
  add("n8n started", "FAIL", "no /healthz after 120 s");
}
async function verify() {
  const url = get("N8N_URL", "http://localhost:5678"),
    key = get("CA_INTERNAL_KEY", ""),
    db = get("DB_NAME", "content_automation");
  const h = await req("GET", url + "/healthz");
  add("n8n health", h.status === 200 ? "PASS" : "FAIL", "HTTP " + h.status);
  if (h.status !== 200) return;
  const lw = n8n(["list:workflow"]);
  const n = clean(lw.stdout)
    .split("\n")
    .filter((l) => /CA \d\d /.test(l)).length;
  add(
    "workflows present in n8n",
    n >= 15 ? "PASS" : "FAIL",
    n + " CA workflows (expected >= 15), duplicates would show here",
  );
  const names = clean(lw.stdout)
    .split("\n")
    .filter((l) => /CA \d\d /.test(l))
    .map((l) => l.split("|")[1]);
  add(
    "no duplicate workflow names",
    new Set(names).size === names.length ? "PASS" : "FAIL",
    "",
  );
  let noKey = { status: 0 };
  for (let i = 0; i < 30; i++) {
    noKey = await req("POST", url + "/webhook/ca-api-approval", {}, "{}");
    if (noKey.status === 403) break;
    await sleep(3000);
  }
  /* webhooks register a few seconds after /healthz */ add(
    "webhook rejects missing key (403)",
    noKey.status === 403 ? "PASS" : "FAIL",
    "HTTP " + noKey.status,
  );
  const bad = await req(
    "POST",
    url + "/webhook/ca-api-approval",
    { "X-CA-Key": key },
    '{"approval_id":"x","action":"approve"}',
  );
  let j = {};
  try {
    j = JSON.parse(bad.body);
  } catch (e) {}
  add(
    "invalid input => HTTP 400 JSON (not 500)",
    bad.status === 400 && j.error === "VALIDATION" ? "PASS" : "FAIL",
    `HTTP ${bad.status} ${bad.body.slice(0, 90)}`,
  );
  const snap = await req(
    "POST",
    url + "/webhook/ca-w-resource",
    { "X-CA-Key": key },
    JSON.stringify({ cpu_percent: 1, ram_percent: 1, disk_free_gb: 999 }),
  );
  add(
    "smoke: resource snapshot webhook -> DB",
    snap.status === 200 ? "PASS" : "FAIL",
    "HTTP " + snap.status,
  );
  const c = psql(
    db,
    "SELECT (SELECT count(*) FROM settings)||'/'||(SELECT count(*) FROM job_type_config)||'/'||(SELECT count(*) FROM resource_snapshots)",
  );
  add(
    "database reachable + seeded (settings/job types/snapshots)",
    c.status === 0 ? "PASS" : "FAIL",
    clean(c.stdout),
  );
  const dup = psql(
    db,
    "SELECT count(*) FROM (SELECT 1 FROM settings GROUP BY key HAVING count(*)>1) x",
  );
  add("no duplicate settings", clean(dup.stdout) === "0" ? "PASS" : "FAIL", "");
  const qa = await req(
    "GET",
    get("QA_WORKER_URL", "http://localhost:9100") + "/health",
  );
  add(
    "QA worker",
    qa.status === 200 ? "PASS" : "WARN",
    qa.status === 200
      ? qa.body
      : "not running: start workers/qa_worker.js (technical QA + thumbnails need it)",
  );
  const os_ = await req(
    "GET",
    get("OPENSHORTS_URL", "http://localhost:8000") + "/",
  );
  add(
    "OpenShorts reachable",
    os_.status ? "PASS" : "WARN",
    os_.status
      ? "HTTP " + os_.status
      : "not reachable: clipping jobs will retry/queue until it is up",
  );
}
(async () => {
  if (mode === "uninstall") {
    add(
      "uninstall",
      "WARN",
      "deactivate/delete CA workflows in n8n and drop the database MANUALLY (destructive; intentionally not automated). See docs/SETUP.md",
    );
    return;
  }
  if (mode === "verify") await verify();
  else if (mode === "setup" || mode === "update") {
    if (!prerequisites()) {
      add("STOP", "FAIL", "fix the failures above and re-run");
    } else if (database()) {
      const map = credentials();
      if (workflows(map) && flags.includes("--start-n8n")) await startN8n();
      if (flags.includes("--start-n8n")) await verify();
      else
        add(
          "next",
          "INFO",
          "restart n8n (so imported workflows take effect), then run: node deployment/deploy.js verify",
        );
    }
  } else {
    console.log(
      "usage: deploy.js <setup|update|verify|uninstall> [--start-n8n]",
    );
    process.exit(2);
  }
})().finally(() => {
  const fails = report.filter((r) => r.status === "FAIL").length;
  try {
    fs.writeFileSync(
      path.join(__dirname, "last_report.json"),
      JSON.stringify(
        { mode, at: new Date().toISOString(), fails, report },
        null,
        2,
      ),
    );
  } catch (e) {}
  console.log(
    `\n${fails ? "RESULT: " + fails + " FAILED" : "RESULT: OK"} (report: deployment/last_report.json)`,
  );
  process.exitCode = fails ? 1 : 0;
});
