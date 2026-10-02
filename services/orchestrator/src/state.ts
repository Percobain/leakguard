import type { FullState, LogLine, Step, StepId, StepStatus, TimelineEvent } from './types.js';
import { config } from './config.js';

const STEP_DEFS: Omit<Step, 'status'>[] = [
  { id: 'leak', title: 'Leak', tool: 'git push', explain: 'A developer accidentally commits the production Gemini API key and pushes it to GitHub.' },
  { id: 'detect', title: 'Detect', tool: 'GitHub Actions + gitleaks', explain: 'Every push triggers a CI job that scans the entire git history for secrets.' },
  { id: 'rotate', title: 'Rotate', tool: 'Google API Keys API + Vault', explain: 'LeakGuard mints a brand-new key and stores it in HashiCorp Vault as a new version.' },
  { id: 'redeploy', title: 'Redeploy', tool: 'Docker', explain: 'The production container restarts and pulls the new key from Vault — users never notice.' },
  { id: 'revoke', title: 'Revoke', tool: 'Google API Keys API', explain: 'Only now is the leaked key deleted at Google, so it is useless to anyone who copied it.' },
  { id: 'clean', title: 'Clean history', tool: 'git filter-repo', explain: 'The secret is scrubbed from every commit and the rewritten history is force-pushed.' },
  { id: 'verify', title: 'Verify', tool: 'gitleaks + GitHub Actions', explain: 'The whole history is re-scanned, locally and in CI, and must come back with zero findings.' },
  { id: 'prove', title: 'Prove', tool: 'Circom + snarkjs (Groth16)', explain: 'A zero-knowledge proof shows the private repo is clean without revealing a single line of code.' },
];

const IDLE_NARRATION = {
  title: 'All quiet. Production is running on a key stored safely in Vault.',
  body: 'Press "Leak a key" to play the intern who pastes the production Gemini key into a config file and pushes it to GitHub. Then watch LeakGuard respond on its own.',
};

const freshSteps = (): Step[] => STEP_DEFS.map((s) => ({ ...s, status: 'idle' as StepStatus }));

export const state: FullState = {
  now: Date.now(),
  mode: { google: config.googleMode },
  busy: false,
  incident: { id: 0, status: 'idle', findings: [] },
  steps: freshSteps(),
  vault: { path: `secret/${config.vaultSecretPath}`, versions: [] },
  attacker: { status: 'scanning', attempts: [], successCount: 0, deniedCount: 0 },
  repo: { fullName: config.targetRepo, url: `https://github.com/${config.targetRepo}`, commits: [] },
  actions: [],
  app: { status: 'down' },
  zk: { status: 'idle' },
  logs: [],
  narration: IDLE_NARRATION,
  timeline: [],
};

// ---- broadcast plumbing ----
type Listener = (s: FullState) => void;
const listeners = new Set<Listener>();
let pending: NodeJS.Timeout | null = null;

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function changed() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    state.now = Date.now();
    for (const fn of listeners) fn(state);
  }, 80);
}

// ---- helpers ----
export function log(source: string, msg: string, level: LogLine['level'] = 'info') {
  state.logs.push({ t: Date.now(), level, source, msg });
  if (state.logs.length > 300) state.logs.splice(0, state.logs.length - 300);
  console.log(`[${source}] ${msg}`);
  changed();
}

export function narrate(title: string, body: string) {
  state.narration = { title, body };
  changed();
}

export function step(id: StepId, status: StepStatus, detail?: string) {
  const s = state.steps.find((x) => x.id === id)!;
  if (status === 'running' && s.status !== 'running') s.startedAt = Date.now();
  if (status === 'done' || status === 'failed' || status === 'skipped') {
    s.startedAt ??= Date.now();
    s.endedAt = Date.now();
  }
  s.status = status;
  if (detail !== undefined) s.detail = detail;
  changed();
}

export function mark(label: string, kind: TimelineEvent['kind'], stepId?: StepId) {
  state.timeline.push({ t: Date.now(), label, kind, step: stepId });
  changed();
}

export function resetIncident() {
  state.incident = { id: state.incident.id, status: 'idle', findings: [] };
  state.steps = freshSteps();
  state.timeline = [];
  state.zk = { status: 'idle' };
  state.attacker = { status: 'scanning', attempts: [], successCount: 0, deniedCount: 0 };
  state.repo.previousCommits = undefined;
  state.narration = IDLE_NARRATION;
  changed();
}

export const mask = (k?: string) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
