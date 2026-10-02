// Shared contract between the orchestrator and the dashboard.
// The orchestrator pushes a full `FullState` snapshot over WebSocket (/ws) on every change:
//   { type: 'state', state: FullState }
// The dashboard copies this file to dashboard/src/types.ts.

export type StepId = 'leak' | 'detect' | 'rotate' | 'redeploy' | 'revoke' | 'clean' | 'verify' | 'prove';
export type StepStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped';

export interface Step {
  id: StepId;
  title: string;        // "Detect"
  tool: string;         // "GitHub Actions + gitleaks"
  status: StepStatus;
  startedAt?: number;   // epoch ms
  endedAt?: number;
  detail?: string;      // short live status line, e.g. "Run #12 in_progress"
  explain: string;      // one plain-English sentence for non-experts
}

export interface Finding {
  ruleId: string;       // "gcp-api-key"
  file: string;
  line: number;
  commit: string;
  author: string;
  secretMasked: string; // "AIza…Xq9z"
  fingerprint: string;
}

export interface Incident {
  id: number;
  status: 'idle' | 'exposed' | 'remediating' | 'resolved' | 'failed';
  leakedAt?: number;
  detectedAt?: number;
  revokedAt?: number;    // the moment the leaked key stopped working
  resolvedAt?: number;
  leakCommit?: string;
  leakedKeyMasked?: string;
  pacedMs?: number;      // presentation pauses inserted between chapters (DEMO_PACE_MS)
  findings: Finding[];
}

export interface VaultVersion {
  version: number;
  keyMasked: string;
  keyId: string;         // Google API key resource id
  createdAt: number;
  status: 'active' | 'revoked' | 'superseded';
  reason?: string;
}

export interface AttackerAttempt {
  t: number;
  keyMasked: string;
  status: number;        // HTTP status from the Gemini endpoint
  message: string;       // "200 OK: model replied" / "403 API_KEY_INVALID"
}

export interface AttackerState {
  status: 'scanning' | 'has-key' | 'blocked';
  keyMasked?: string;
  harvestedAt?: number;
  sourceCommit?: string;
  attempts: AttackerAttempt[]; // newest last, max 60
  successCount: number;
  deniedCount: number;
}

export interface Commit {
  sha: string;
  short: string;
  message: string;
  author: string;
  date: number;
  dirty: boolean;        // contains the leaked secret
}

export interface RepoState {
  fullName: string;      // "Percobain/leakguard-demo-target"
  url: string;
  commits: Commit[];          // current history (newest first)
  previousCommits?: Commit[]; // history before the rewrite (for before/after view)
}

export interface ActionsRun {
  id: number;
  runNumber: number;
  name: string;
  status: string;        // queued | in_progress | completed
  conclusion: string | null; // success | failure | null
  url: string;
  headSha: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  status: 'healthy' | 'degraded' | 'restarting' | 'down';
  containerId?: string;
  startedAt?: number;
  keyMasked?: string;
  keyVersion?: number;
  upstreamOk?: boolean;  // last Gemini call from the app succeeded
  lastCheck?: number;
  aiMessage?: string;    // text the app got back from (mock) Gemini
  vaultAuth?: string;    // "AppRole demo-app (policy: gemini-read)"
}

export interface ZkPublicSignals {
  commitment: string;    // Poseidon Merkle root over repo token hashes (circuit output)
  leakedKeyHash: string; // hash of the revoked key
  commitSha: string;     // git HEAD the proof is bound to (as field element)
  commitShaHex: string;
}

export interface ZkState {
  status: 'idle' | 'proving' | 'proved' | 'failed';
  publicSignals?: ZkPublicSignals;
  rawPublicSignals?: string[]; // exactly as snarkjs returns them (for in-browser verify)
  proof?: unknown;             // groth16 proof object
  provedAt?: number;
  durationMs?: number;
  tokenCount?: number;         // candidate tokens committed (max 64)
  error?: string;              // e.g. "Leaked key still present in repo: proof impossible"
}

export interface LogLine {
  t: number;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;        // "github" | "gitleaks" | "vault" | "google" | "docker" | "git" | "zk" | "attacker" | "leakguard"
  msg: string;
}

export interface TimelineEvent {
  t: number;
  label: string;
  step?: StepId;
  kind: 'bad' | 'good' | 'neutral';
}

export interface FullState {
  now: number;
  mode: { google: 'simulated' | 'real' };
  busy: boolean;               // a leak/remediation/reset is in progress
  incident: Incident;
  steps: Step[];
  vault: { path: string; versions: VaultVersion[] };
  attacker: AttackerState;
  repo: RepoState;
  actions: ActionsRun[];       // newest first, max 8
  app: AppState;
  zk: ZkState;
  logs: LogLine[];             // newest last, max 300
  narration: { title: string; body: string };
  timeline: TimelineEvent[];
}

// REST (orchestrator :4000, proxied by the dashboard under /api):
//   GET  /api/state                -> FullState
//   POST /api/leak                 -> simulate an intern pushing the prod key
//   POST /api/reset                -> restore demo repo to baseline, clear incident
//   POST /api/zk/prove             -> try to prove the repo clean right now (fails while dirty)
//   GET  /api/zk/verification_key.json
//   GET  /api/zk/proof.json        -> { proof, publicSignals }
