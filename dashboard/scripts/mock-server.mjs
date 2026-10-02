// Dev-only stand-in for the orchestrator (port 4000) that plays a scripted incident,
// so the dashboard can be designed without Docker/GitHub. Usage: npm run mock + npm run dev.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const STEPS = [
  ['leak', 'Leak', 'git push', 'A developer pushed a commit that contains a live API key.'],
  ['detect', 'Detect', 'GitHub Actions + gitleaks', 'A CI scanner reads every push and spots the key pattern.'],
  ['rotate', 'Rotate', 'Google API Keys API', 'A brand-new key is created to replace the leaked one.'],
  ['redeploy', 'Redeploy', 'Vault + Docker', 'The new key goes into Vault and the app restarts with it.'],
  ['revoke', 'Revoke', 'Google API Keys API', 'The leaked key is deleted, so it becomes useless to attackers.'],
  ['clean', 'Clean history', 'git filter-repo', 'Every old commit is rewritten so the key text disappears.'],
  ['verify', 'Verify', 'gitleaks (full history)', 'The whole history is scanned again and must come back clean.'],
  ['prove', 'Prove', 'Circom + snarkjs', 'A zero-knowledge proof shows the repo is clean without revealing it.'],
];

const sha = () => [...Array(40)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const keyA = 'AIza…Xq9z';
const keyB = 'AIza…7Kd2';

let state;
let timers = [];
let attackTimer = null;

function fresh() {
  const c1 = sha(), c2 = sha();
  return {
    now: Date.now(),
    mode: { google: 'simulated' },
    busy: false,
    incident: { id: 0, status: 'idle', findings: [] },
    steps: STEPS.map(([id, title, tool, explain]) => ({ id, title, tool, explain, status: 'idle' })),
    vault: { path: 'secret/data/gemini', versions: [{ version: 1, keyMasked: keyA, keyId: 'keys/3f1a9c', createdAt: Date.now() - 3600e3, status: 'active' }] },
    attacker: { status: 'scanning', attempts: [], successCount: 0, deniedCount: 0 },
    repo: {
      fullName: 'Percobain/leakguard-demo-target',
      url: 'https://github.com/Percobain/leakguard-demo-target',
      commits: [
        { sha: c2, short: c2.slice(0, 7), message: 'feat: gemini fortune endpoint', author: 'alice', date: Date.now() - 7200e3, dirty: false },
        { sha: c1, short: c1.slice(0, 7), message: 'initial commit', author: 'alice', date: Date.now() - 9000e3, dirty: false },
      ],
    },
    actions: [],
    app: { status: 'healthy', containerId: sha(), startedAt: Date.now() - 3600e3, keyMasked: keyA, keyVersion: 1, upstreamOk: true, lastCheck: Date.now(), aiMessage: 'Your code will compile on the first try today. ✨', vaultAuth: 'AppRole demo-app (policy: gemini-read)' },
    zk: { status: 'idle' },
    logs: [{ t: Date.now(), level: 'info', source: 'leakguard', msg: 'LeakGuard online. Watching Percobain/leakguard-demo-target' }],
    narration: { title: 'All clear', body: 'The production app is running with a key stored safely in Vault. Press "Leak a key" to simulate a developer mistake.' },
    timeline: [],
  };
}
state = fresh();

const step = (id) => state.steps.find((s) => s.id === id);
const log = (source, msg, level = 'info') => { state.logs.push({ t: Date.now(), level, source, msg }); state.logs = state.logs.slice(-300); };
const tl = (label, kind, s) => state.timeline.push({ t: Date.now(), label, kind, step: s });
const narrate = (title, body) => (state.narration = { title, body });
const start = (id, detail) => Object.assign(step(id), { status: 'running', startedAt: Date.now(), detail });
const done = (id, detail) => Object.assign(step(id), { status: 'done', endedAt: Date.now(), detail });

function at(ms, fn) { timers.push(setTimeout(() => { fn(); broadcast(); }, ms)); }

function attack(keyAlive) {
  clearInterval(attackTimer);
  attackTimer = setInterval(() => {
    const ok = keyAlive();
    state.attacker.attempts.push({ t: Date.now(), keyMasked: keyA, status: ok ? 200 : 403, message: ok ? '200 OK: model replied, billed to victim' : '403 API_KEY_INVALID: key revoked' });
    state.attacker.attempts = state.attacker.attempts.slice(-60);
    ok ? state.attacker.successCount++ : state.attacker.deniedCount++;
    broadcast();
  }, 900);
}

function leak() {
  state.busy = true;
  const leakSha = sha();
  let alive = true;
  Object.assign(state.incident, { id: state.incident.id + 1, status: 'exposed', leakedAt: Date.now(), leakCommit: leakSha, leakedKeyMasked: keyA });
  state.repo.commits.unshift({ sha: leakSha, short: leakSha.slice(0, 7), message: 'add prod config for quick testing 🙈', author: 'intern-dev', date: Date.now(), dirty: true });
  done('leak', `commit ${leakSha.slice(0, 7)}`);
  step('leak').startedAt = Date.now();
  tl('Key pushed', 'bad', 'leak');
  log('github', `intern-dev pushed ${leakSha.slice(0, 7)} to main`, 'warn');
  narrate('🚨 A live API key was just pushed to GitHub', 'An intern committed config/production.env with the real Gemini key. From this second, anyone who can read the repo can use it.');
  const run = { id: 1, runNumber: 12, name: 'LeakGuard secret scan', status: 'queued', conclusion: null, url: '#', headSha: leakSha, createdAt: Date.now(), updatedAt: Date.now() };
  state.actions.unshift(run);
  start('detect', 'run #12 queued');
  broadcast();

  at(2500, () => { run.status = 'in_progress'; step('detect').detail = 'run #12 in_progress'; log('github', 'Actions run #12 started'); });
  at(4000, () => {
    Object.assign(state.attacker, { status: 'has-key', keyMasked: keyA, harvestedAt: Date.now(), sourceCommit: leakSha });
    log('attacker', `harvested ${keyA} from ${leakSha.slice(0, 7)}`, 'error');
    tl('Attacker has key', 'bad');
    attack(() => alive);
  });
  at(7000, () => {
    run.status = 'completed'; run.conclusion = 'failure';
    state.incident.findings.push({ ruleId: 'gcp-api-key', file: 'config/production.env', line: 3, commit: leakSha, author: 'intern-dev', secretMasked: keyA, fingerprint: 'x' });
    state.incident.detectedAt = Date.now(); state.incident.status = 'remediating';
    done('detect', '1 finding: gcp-api-key');
    log('gitleaks', 'gcp-api-key in config/production.env:3', 'error');
    tl('Detected', 'neutral', 'detect');
    narrate('🔎 gitleaks caught it', 'The CI scanner found a Google API key in config/production.env. LeakGuard is taking over automatically, with no human needed.');
    start('rotate', 'creating new key…');
  });
  at(9000, () => {
    done('rotate', `new key ${keyB}`);
    state.vault.versions[0].status = 'superseded';
    state.vault.versions.push({ version: 2, keyMasked: keyB, keyId: 'keys/9b77e1', createdAt: Date.now(), status: 'active', reason: 'rotated: leak in ' + leakSha.slice(0, 7) });
    log('google', `created key ${keyB}`, 'success'); log('vault', 'secret/gemini → v2', 'success');
    narrate('🔑 New key created and stored in Vault', 'Google issued a fresh key. Vault now holds it as version 2. The old key still works for a moment so customers are not disrupted.');
    start('redeploy', 'restarting container…'); state.app.status = 'restarting';
  });
  at(12000, () => {
    Object.assign(state.app, { status: 'healthy', containerId: sha(), startedAt: Date.now(), keyMasked: keyB, keyVersion: 2, aiMessage: 'A fresh key brings fresh luck. 🍀' });
    done('redeploy', 'healthy on v2'); log('docker', 'demo-app restarted, health OK', 'success');
    start('revoke', 'deleting old key…');
    narrate('🐳 App redeployed with the new key', 'The production container restarted, read v2 from Vault and is serving customers again. Now LeakGuard kills the leaked key.');
  });
  at(13500, () => {
    alive = false;
    state.incident.revokedAt = Date.now();
    state.vault.versions[0].status = 'revoked';
    Object.assign(state.attacker, { status: 'blocked' });
    done('revoke', `${keyA} deleted`); log('google', `deleted ${keyA}`, 'success');
    tl('Key dead', 'good', 'revoke');
    narrate('✋ The leaked key is now worthless', 'Google rejects every request made with it. Watch the attacker panel: 200 OK became 403 DENIED.');
    start('clean', 'git filter-repo --replace-text');
  });
  at(17000, () => {
    state.repo.previousCommits = state.repo.commits.map((c) => ({ ...c }));
    state.repo.commits = state.repo.commits.map((c) => (c.dirty ? { ...c, sha: sha(), dirty: false, short: '' } : c)).map((c) => ({ ...c, short: c.sha.slice(0, 7) }));
    done('clean', 'force-pushed 1 rewritten commit'); tl('History clean', 'good', 'clean');
    log('git', 'force-pushed rewritten history', 'success');
    start('verify', 'gitleaks detect --log-opts=--all');
    state.actions.unshift({ id: 2, runNumber: 13, name: 'LeakGuard secret scan', status: 'in_progress', conclusion: null, url: '#', headSha: state.repo.commits[0].sha, createdAt: Date.now(), updatedAt: Date.now() });
    narrate('🧽 History rewritten', 'Every commit that held the key was rewritten and force-pushed. Deleting a file is not enough. This is.');
  });
  at(19000, () => { done('verify', '0 findings in 3 commits'); start('prove', 'witness + groth16…'); state.zk = { status: 'proving' }; });
  at(22000, () => {
    state.actions[0].status = 'completed'; state.actions[0].conclusion = 'success';
    state.zk = {
      status: 'proved', provedAt: Date.now(), durationMs: 2140, tokenCount: 17, proof: {}, rawPublicSignals: ['1', '2', '3'],
      publicSignals: { commitment: '1489302948120394810293812093812093812038120938', leakedKeyHash: '981237918237918273918273918273981723', commitSha: '123', commitShaHex: state.repo.commits[0].sha },
    };
    done('prove', 'proof ok (2.1s)');
    Object.assign(state.incident, { status: 'resolved', resolvedAt: Date.now() });
    tl('ZK proof', 'good', 'prove');
    log('zk', 'Groth16 proof generated', 'success');
    narrate('✅ Incident closed, with mathematical proof', 'The key is dead, history is clean, and a zero-knowledge proof shows the private repo no longer contains it. Click "Verify in my browser" to check it yourself.');
    state.busy = false;
  });
}

const wsClients = new Set();
function broadcast() {
  state.now = Date.now();
  const msg = JSON.stringify({ type: 'state', state });
  for (const ws of wsClients) ws.send(msg);
}

const server = http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/api/state') return send(200, state);
  if (req.method === 'POST' && req.url === '/api/leak') { if (state.busy) return send(409, { error: 'busy' }); leak(); return send(202, { ok: true }); }
  if (req.method === 'POST' && req.url === '/api/reset') { timers.forEach(clearTimeout); clearInterval(attackTimer); timers = []; const id = state.incident.id; state = fresh(); state.incident.id = id; broadcast(); return send(200, { ok: true }); }
  if (req.method === 'POST' && req.url === '/api/zk/prove') { state.zk = { status: 'failed', error: 'Leaked key still present in repo: proof impossible' }; broadcast(); return send(200, {}); }
  send(404, { error: 'not found' });
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => { wsClients.add(ws); ws.send(JSON.stringify({ type: 'state', state })); ws.on('close', () => wsClients.delete(ws)); });
const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => console.log(`mock orchestrator on :${PORT}`));
