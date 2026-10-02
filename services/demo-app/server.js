// "Gemini Fortune Teller", the production app whose key LeakGuard protects.
// On startup it logs in to Vault with AppRole, reads the Gemini key ONCE, and keeps using it.
// So a rotated key only takes effect after a redeploy, exactly what LeakGuard automates.
import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault:8200';
const ROLE_ID = process.env.VAULT_ROLE_ID || 'demo-app';
const SECRET_ID = process.env.VAULT_SECRET_ID || '';
const SECRET_PATH = process.env.VAULT_SECRET_PATH || 'secret/data/leakguard/gemini';
const GEMINI_BASE = process.env.GEMINI_BASE || 'http://mock-google:7000';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const state = {
  status: 'starting',
  startedAt: Date.now(),
  keyMasked: null,
  keyVersion: null,
  upstreamOk: null,
  aiMessage: null,
  lastCheck: null,
  vaultAuth: null,
};
let apiKey = null;

const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadKeyFromVault() {
  for (;;) {
    try {
      const login = await fetch(`${VAULT_ADDR}/v1/auth/approle/login`, {
        method: 'POST',
        body: JSON.stringify({ role_id: ROLE_ID, secret_id: SECRET_ID }),
      });
      if (!login.ok) throw new Error(`approle login ${login.status}`);
      const { auth } = await login.json();
      const sec = await fetch(`${VAULT_ADDR}/v1/${SECRET_PATH}`, { headers: { 'X-Vault-Token': auth.client_token } });
      if (!sec.ok) throw new Error(`read secret ${sec.status}`);
      const body = await sec.json();
      apiKey = body.data.data.api_key;
      state.keyVersion = body.data.metadata.version;
      state.keyMasked = mask(apiKey);
      state.vaultAuth = `AppRole "${ROLE_ID}" → policies: ${auth.policies.filter((p) => p !== 'default').join(', ')}`;
      console.log(`loaded Gemini key v${state.keyVersion} ${state.keyMasked} from Vault`);
      return;
    } catch (e) {
      state.status = 'down';
      console.log(`waiting for Vault: ${e.message}`);
      await sleep(2000);
    }
  }
}

async function callGemini() {
  try {
    const r = await fetch(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'fortune-teller/1.0' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Tell a one-line DevOps fortune.' }] }] }),
    });
    const body = await r.json();
    state.upstreamOk = r.ok;
    state.aiMessage = r.ok ? body.candidates?.[0]?.content?.parts?.[0]?.text : `Gemini error: ${body.error?.message}`;
    state.status = r.ok ? 'healthy' : 'degraded';
  } catch (e) {
    state.upstreamOk = false;
    state.status = 'degraded';
    state.aiMessage = `Gemini unreachable: ${e.message}`;
  }
  state.lastCheck = Date.now();
}

const page = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fortune Teller</title><meta http-equiv="refresh" content="4"><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e8ecff;font-family:system-ui,sans-serif}
.card{max-width:560px;padding:32px;border-radius:20px;background:#141b33;box-shadow:0 20px 60px #0008;text-align:center}
.msg{font-size:24px;margin:20px 0}.meta{color:#8b95c9;font-size:13px}.ok{color:#3ddc97}.bad{color:#ff5c7a}</style></head>
<body><div class="card"><h1>🔮 Gemini Fortune Teller</h1><div class="msg">${state.aiMessage ?? '…'}</div>
<div class="meta">status: <b class="${state.upstreamOk ? 'ok' : 'bad'}">${state.status}</b> · key v${state.keyVersion} ${state.keyMasked} · via ${state.vaultAuth}</div></div></body></html>`;

http
  .createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(state));
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page());
  })
  .listen(PORT, async () => {
    console.log(`fortune-teller on :${PORT}`);
    await loadKeyFromVault();
    await callGemini();
    setInterval(callGemini, 3000);
  });
