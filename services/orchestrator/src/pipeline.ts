import { config } from './config.js';
import { state, log, narrate, step, mark, resetIncident, changed, mask, sleep } from './state.js';
import * as vault from './vault.js';
import * as google from './google.js';
import * as docker from './docker.js';
import * as git from './git.js';
import * as github from './github.js';
import { proveClean, DirtyRepoError } from './zk.js';
import type { ActionsRun, Finding } from './types.js';

const knownLeaked: string[] = []; // every key that has ever been leaked (kept forever)
const handledRuns = new Set<number>();
let lastResetAt = 0;

// ---- serialize everything that touches the local git clone ----
let lock: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function refreshRepo() {
  await exclusive(async () => {
    await git.sync();
    state.repo.commits = await git.listCommits(knownLeaked);
    changed();
  });
}

async function refreshVaultVersions() {
  const cur = await vault.readCurrent();
  if (!cur) return;
  const versions = [];
  for (let v = 1; v <= cur.version; v++) {
    const data = v === cur.version ? cur.data : await vault.readVersion(v);
    if (!data) continue;
    const prev = state.vault.versions.find((x) => x.version === v);
    let status: 'active' | 'revoked' | 'superseded' = v === cur.version ? 'active' : prev?.status ?? 'revoked';
    versions.push({ version: v, keyMasked: mask(data.api_key), keyId: data.key_id, createdAt: data.created_at, status, reason: data.reason });
  }
  state.vault.versions = versions;
  changed();
}

// ---------------------------------------------------------------- bootstrap
export async function bootstrap() {
  log('leakguard', `Starting LeakGuard (Google mode: ${config.googleMode}) watching ${config.targetRepo}`);
  await vault.bootstrapVault();

  let cur = await vault.readCurrent();
  if (!cur || !(await google.keyWorks(cur.data.api_key))) {
    log('google', 'No valid production key in Vault — provisioning one via the API Keys API');
    const key = await google.createKey('fortune-teller-prod');
    await vault.writeSecret({ api_key: key.keyString, key_id: key.keyId, created_at: Date.now(), reason: 'initial provisioning' });
    log('vault', `Stored production key ${mask(key.keyString)} at secret/${config.vaultSecretPath}`, 'success');
    if (await docker.inspectApp()) await docker.restartApp().catch(() => undefined);
  }
  await refreshVaultVersions();

  for (const run of await github.listRuns()) handledRuns.add(run.id); // ignore history from before we started
  await refreshRepo();
  log('github', `Tracking ${state.repo.commits.length} commits on ${config.targetRepo}`);

  setInterval(() => pollActions().catch((e) => log('github', e.message, 'warn')), 3000);
  setInterval(() => pollApp().catch(() => undefined), 2000);
  setInterval(() => pollRepoHead().catch(() => undefined), 10000);
  log('leakguard', 'Ready. Waiting for pushes…', 'success');
}

// ---------------------------------------------------------------- monitors
async function pollApp() {
  const info = await docker.inspectApp();
  let health: any = null;
  try {
    const r = await fetch(`${config.demoAppUrl}/health`, { signal: AbortSignal.timeout(1500) });
    health = await r.json();
  } catch { /* restarting */ }
  const restarting = state.app.status === 'restarting' && (!health || health.keyVersion !== state.vault.versions.at(-1)?.version);
  state.app = {
    status: restarting ? 'restarting' : !info?.running || !health ? 'down' : health.upstreamOk ? 'healthy' : 'degraded',
    containerId: info?.id,
    startedAt: info?.startedAt,
    keyMasked: health?.keyMasked ?? undefined,
    keyVersion: health?.keyVersion ?? undefined,
    upstreamOk: health?.upstreamOk ?? undefined,
    lastCheck: Date.now(),
    aiMessage: health?.aiMessage ?? undefined,
    vaultAuth: health?.vaultAuth ?? undefined,
  };
  changed();
}

let lastHead = '';
async function pollRepoHead() {
  if (state.busy) return;
  const sha = await github.headSha();
  if (sha !== lastHead) {
    lastHead = sha;
    await refreshRepo();
  }
}

async function pollActions() {
  const runs = await github.listRuns();
  state.actions = runs;
  const detect = state.steps.find((s) => s.id === 'detect')!;
  if (detect.status === 'running' && state.incident.leakCommit) {
    const run = runs.find((r) => r.headSha === state.incident.leakCommit);
    step('detect', 'running', run ? `Run #${run.runNumber}: ${run.status.replace('_', ' ')}` : 'Waiting for GitHub to start the workflow…');
  }
  changed();

  for (const run of runs) {
    if (handledRuns.has(run.id) || run.status !== 'completed' || run.createdAt < lastResetAt) continue;
    handledRuns.add(run.id);
    if (run.conclusion !== 'failure') continue;
    const { findings, secrets } = await github.downloadFindings(run.id);
    if (!findings.length) continue;
    if (state.busy && state.incident.status === 'remediating') continue;
    remediate(run, findings, [...new Set(secrets)]).catch((e) => {
      log('leakguard', `Remediation failed: ${e.message}`, 'error');
      state.incident.status = 'failed';
      state.busy = false;
      const running = state.steps.find((s) => s.status === 'running');
      if (running) step(running.id, 'failed', e.message);
      narrate('Remediation hit an error', e.message);
    });
  }
}

// ---------------------------------------------------------------- attacker feed
export function attackerEvent(ev: any) {
  const a = state.attacker;
  if (ev.type === 'harvested') {
    a.status = 'has-key';
    a.keyMasked = ev.keyMasked;
    a.harvestedAt = ev.t;
    a.sourceCommit = ev.commit;
    log('attacker', `Scraper bot harvested ${ev.keyMasked} from commit ${String(ev.commit).slice(0, 7)} (${ev.file})`, 'error');
    mark('Attacker harvested the key', 'bad');
    if (state.incident.status === 'exposed') {
      narrate('An attacker already has the key.', `A scraper bot found ${ev.keyMasked} in the commit within seconds and is now using it to call Gemini on our bill. Deleting the file will not help — the bot already copied it.`);
    }
  } else if (ev.type === 'attempt') {
    a.attempts.push({ t: ev.t, keyMasked: ev.keyMasked, status: ev.status, message: ev.message });
    if (a.attempts.length > 60) a.attempts.splice(0, a.attempts.length - 60);
    if (ev.status === 200) {
      a.successCount++;
      a.status = 'has-key';
    } else {
      a.deniedCount++;
      if (a.status !== 'blocked') {
        a.status = 'blocked';
        log('attacker', `Stolen key rejected by Google: ${ev.message}`, 'success');
        mark('Attacker blocked', 'good');
      }
    }
  }
  changed();
}

// ---------------------------------------------------------------- leak
export async function leak() {
  if (state.busy) throw new Error('Busy — wait for the current run to finish');
  state.busy = true;
  resetIncident();
  state.incident = { id: state.incident.id + 1, status: 'exposed', findings: [] };
  try {
    const cur = await vault.readCurrent();
    if (!cur) throw new Error('No production key in Vault');
    step('leak', 'running', 'git commit && git push');
    narrate('Uh-oh. The intern just pushed the production key.', `"Rahul (intern)" pasted GEMINI_API_KEY=${mask(cur.data.api_key)} into config/production.env and pushed to GitHub. From this second, anyone who can see the repo can steal it.`);
    log('github', `${config.leakAuthorName} is pushing config/production.env…`, 'warn');
    if (!knownLeaked.includes(cur.data.api_key)) knownLeaked.push(cur.data.api_key);
    await fetch(`${config.attackerUrl}/reset`, { method: 'POST' }).catch(() => undefined);
    const sha = await exclusive(() => git.commitLeak(cur.data.api_key));
    state.incident.leakedAt = Date.now();
    state.incident.leakCommit = sha;
    state.incident.leakedKeyMasked = mask(cur.data.api_key);
    step('leak', 'done', `commit ${sha.slice(0, 7)} pushed`);
    mark('Production key pushed to GitHub', 'bad', 'leak');
    log('github', `Pushed ${sha.slice(0, 7)} "add prod config so the demo works on my machine" — contains ${mask(cur.data.api_key)}`, 'error');
    step('detect', 'running', 'Waiting for GitHub to start the workflow…');
    await refreshRepo();
  } catch (e) {
    state.busy = false;
    state.incident.status = 'failed';
    step('leak', 'failed', (e as Error).message);
    throw e;
  }
}

// ---------------------------------------------------------------- remediation
async function remediate(run: ActionsRun, findings: Finding[], secrets: string[]) {
  state.busy = true;
  const inc = state.incident;
  if (inc.status === 'idle' || inc.status === 'resolved' || inc.status === 'failed') {
    // A real push from someone, not the demo button.
    resetIncident();
    state.incident = { id: inc.id + 1, status: 'exposed', findings: [], leakedAt: run.createdAt, leakCommit: run.headSha };
    step('leak', 'done', `commit ${run.headSha.slice(0, 7)}`);
    mark('Secret pushed to GitHub', 'bad', 'leak');
  }
  for (const s of secrets) if (!knownLeaked.includes(s)) knownLeaked.push(s);
  state.incident.status = 'remediating';
  state.incident.detectedAt = Date.now();
  state.incident.findings = findings;
  const f = findings[0];
  step('detect', 'done', `${findings.length} finding(s) · ${f.ruleId} in ${f.file}:${f.line}`);
  mark('gitleaks flagged the secret', 'neutral', 'detect');
  log('gitleaks', `Run #${run.runNumber} FAILED: ${f.ruleId} ${f.secretMasked} in ${f.file}:${f.line} (commit ${f.commit.slice(0, 7)}, author ${f.author})`, 'error');
  narrate('Caught it! gitleaks flagged the key in CI.', `GitHub Actions scanned the full history and found a ${f.ruleId} in ${f.file}. LeakGuard now takes over automatically: rotate, redeploy, revoke, clean, verify, prove.`);

  const cur = await vault.readCurrent();
  const managed = cur && secrets.includes(cur.data.api_key);
  if (managed && cur) {
    // 1. ROTATE — new key first, so production never goes down.
    step('rotate', 'running', 'Creating a new key via the API Keys API…');
    narrate('Step 1 · Mint a fresh key.', 'LeakGuard asks Google\'s API Keys API for a brand-new Gemini key and stores it in HashiCorp Vault as a new version. The old key still works for a few seconds so production does not break.');
    const fresh = await google.createKey(`fortune-teller-prod-${Date.now()}`);
    log('google', `Created ${fresh.keyId.split('/').pop()} → ${mask(fresh.keyString)}`, 'success');
    const newVersion = await vault.writeSecret({
      api_key: fresh.keyString,
      key_id: fresh.keyId,
      created_at: Date.now(),
      reason: `rotated: leaked in ${f.commit.slice(0, 7)}`,
    });
    const old = state.vault.versions.find((v) => v.version === cur.version);
    if (old) old.status = 'superseded';
    await refreshVaultVersions();
    log('vault', `secret/${config.vaultSecretPath} v${newVersion} written (v${cur.version} superseded)`, 'success');
    step('rotate', 'done', `Vault v${cur.version} → v${newVersion}`);
    mark('New key stored in Vault', 'good', 'rotate');

    // 2. REDEPLOY — restart the container, it pulls v(new) from Vault via AppRole.
    step('redeploy', 'running', `Restarting ${config.demoAppContainer}…`);
    narrate('Step 2 · Redeploy production with the new key.', 'The Docker container is restarted. On boot it logs into Vault with its AppRole identity and fetches the new key. Users of the app see no downtime.');
    state.app.status = 'restarting';
    changed();
    await docker.restartApp();
    log('docker', `Restarted ${config.demoAppContainer}`);
    const deadline = Date.now() + 60_000;
    while (!(state.app.keyVersion === newVersion && state.app.upstreamOk)) {
      if (Date.now() > deadline) throw new Error('App did not come back healthy on the new key');
      await sleep(1000);
      await pollApp();
    }
    step('redeploy', 'done', `healthy on key v${newVersion}`);
    log('docker', `App healthy on key v${newVersion} ${mask(fresh.keyString)}`, 'success');
    mark('Production running on new key', 'good', 'redeploy');

    // 3. REVOKE — now the leaked key can die.
    step('revoke', 'running', `Deleting ${cur.data.key_id.split('/').pop()}…`);
    narrate('Step 3 · Kill the leaked key.', 'Now that production no longer needs it, LeakGuard deletes the leaked key at Google. Watch the attacker panel: their requests start failing.');
    await google.deleteKey(cur.data.key_id);
    state.incident.revokedAt = Date.now();
    const leakedV = state.vault.versions.find((v) => v.version === cur.version);
    if (leakedV) leakedV.status = 'revoked';
    log('google', `Deleted leaked key ${mask(cur.data.api_key)} — it is now worthless`, 'success');
    step('revoke', 'done', `${mask(cur.data.api_key)} deleted at Google`);
    mark('Leaked key revoked', 'good', 'revoke');
  } else {
    for (const id of ['rotate', 'redeploy', 'revoke'] as const) step(id, 'skipped', 'Not a LeakGuard-managed secret — owner notified');
    log('leakguard', 'Leaked secret is not managed by LeakGuard; skipping rotation', 'warn');
  }

  // 4. CLEAN HISTORY
  step('clean', 'running', 'git filter-repo --replace-text…');
  narrate('Step 4 · Erase it from git history.', 'Deleting the file in a new commit would leave the key in history forever. LeakGuard rewrites every commit with git filter-repo, replacing the key with ***REMOVED-BY-LEAKGUARD***, and force-pushes.');
  state.repo.previousCommits = state.repo.commits;
  await exclusive(() => git.rewriteHistory(secrets));
  await refreshRepo();
  lastHead = state.repo.commits[0]?.sha ?? '';
  log('git', `History rewritten & force-pushed. New HEAD ${lastHead.slice(0, 7)}`, 'success');
  step('clean', 'done', `HEAD ${state.repo.previousCommits[0]?.short} → ${lastHead.slice(0, 7)}`);
  mark('History scrubbed', 'good', 'clean');

  // 5. VERIFY — local gitleaks + wait for CI to go green.
  step('verify', 'running', 'gitleaks on full history…');
  narrate('Step 5 · Double-check everything.', 'gitleaks re-scans every commit locally, and the force-push triggers the GitHub Actions scan again. Both must come back clean.');
  const localFindings = await exclusive(() => git.scanLocal());
  if (localFindings > 0) throw new Error(`gitleaks still finds ${localFindings} secret(s) after the rewrite`);
  log('gitleaks', 'Local scan of full rewritten history: 0 findings', 'success');
  step('verify', 'running', 'Local: 0 findings · waiting for CI re-scan…');
  const ciDeadline = Date.now() + 150_000;
  let ci: ActionsRun | undefined;
  while (Date.now() < ciDeadline) {
    ci = state.actions.find((r) => r.headSha === lastHead);
    if (ci?.status === 'completed') break;
    step('verify', 'running', `Local: 0 findings · CI ${ci ? `run #${ci.runNumber} ${ci.status.replace('_', ' ')}` : 'starting'}…`);
    await sleep(2000);
  }
  if (ci?.status === 'completed' && ci.conclusion !== 'success') throw new Error(`CI re-scan run #${ci.runNumber} still failing`);
  step('verify', 'done', ci?.status === 'completed' ? `Local 0 findings · CI run #${ci.runNumber} ✔` : 'Local 0 findings · CI still running');
  log('github', ci?.status === 'completed' ? `CI re-scan run #${ci.runNumber} passed` : 'CI re-scan still running (continuing)', 'success');
  mark('Re-scan clean', 'good', 'verify');

  // 6. PROVE
  step('prove', 'running', 'Generating Groth16 proof…');
  narrate('Step 6 · Prove it — without showing the code.', 'The repo is private, so an auditor cannot just look. LeakGuard generates a zero-knowledge proof: "the leaked key is not anywhere in this commit\'s files" — verifiable by anyone, revealing nothing else.');
  const ok = await proveNow();
  if (!ok) throw new Error(state.zk.error || 'Proof failed');
  step('prove', 'done', `${state.zk.tokenCount} tokens · ${state.zk.durationMs} ms`);
  mark('ZK proof generated', 'good', 'prove');

  state.incident.status = 'resolved';
  state.incident.resolvedAt = Date.now();
  state.busy = false;
  const secs = (t?: number) => (t && state.incident.leakedAt ? Math.round((t - state.incident.leakedAt) / 1000) : 0);
  narrate(
    'Incident closed. ✅',
    `Key dead ${secs(state.incident.revokedAt)}s after the leak, history clean and proven at ${secs(state.incident.resolvedAt)}s — with zero downtime. Click "Verify in my browser" to check the proof yourself.`,
  );
  log('leakguard', `Incident #${state.incident.id} resolved in ${secs(state.incident.resolvedAt)}s`, 'success');
}

// ---------------------------------------------------------------- ZK
export async function proveNow(): Promise<boolean> {
  state.zk = { status: 'proving' };
  changed();
  const target = knownLeaked.at(-1) ?? (await vault.readCurrent())?.data.api_key;
  if (!target) {
    state.zk = { status: 'failed', error: 'No key to prove against yet' };
    changed();
    return false;
  }
  try {
    const { tokens, sha } = await exclusive(async () => {
      await git.sync();
      return { tokens: await git.candidateTokens(), sha: await git.head() };
    });
    log('zk', `Committing ${tokens.length} candidate tokens from all reachable blobs at ${sha.slice(0, 7)}; proving ${mask(target)} is not among them…`);
    const res = await proveClean({ tokens, leakedKey: target, commitSha: sha, buildDir: config.zkBuildDir });
    const [commitment, leakedKeyHash, commitSha] = res.publicSignals;
    state.zk = {
      status: 'proved',
      proof: res.proof,
      rawPublicSignals: res.publicSignals,
      publicSignals: { commitment, leakedKeyHash, commitSha, commitShaHex: sha },
      provedAt: Date.now(),
      durationMs: res.durationMs,
      tokenCount: res.tokenCount,
    };
    log('zk', `Groth16 proof generated in ${res.durationMs} ms (commitment ${commitment.slice(0, 12)}…)`, 'success');
    changed();
    return true;
  } catch (e) {
    const dirty = e instanceof DirtyRepoError;
    state.zk = { status: 'failed', error: dirty ? `Can't prove a lie: ${mask(target)} is still in the repo` : (e as Error).message };
    log('zk', state.zk.error!, dirty ? 'warn' : 'error');
    if (dirty && state.incident.status !== 'remediating') {
      narrate('No proof possible — and that is the point.', `The circuit refuses to produce a proof while ${mask(target)} is still somewhere in the repo's history. A zero-knowledge proof cannot be faked.`);
    }
    changed();
    return false;
  }
}

// ---------------------------------------------------------------- reset
export async function reset() {
  if (state.busy && state.incident.status === 'remediating') throw new Error('Remediation in progress');
  state.busy = true;
  changed();
  try {
    log('leakguard', 'Resetting demo: restoring baseline history');
    lastResetAt = Date.now();
    await exclusive(() => git.resetToBaseline());
    await fetch(`${config.attackerUrl}/reset`, { method: 'POST' }).catch(() => undefined);
    resetIncident();
    await refreshRepo();
    lastHead = state.repo.commits[0]?.sha ?? '';
    for (const run of state.actions) handledRuns.add(run.id);
    log('leakguard', 'Demo reset. Production key unchanged in Vault.', 'success');
  } finally {
    state.busy = false;
    changed();
  }
}
