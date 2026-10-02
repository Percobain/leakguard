import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon, ArrowUpRightIcon, CheckIcon, CircleNotchIcon, CubeIcon, DetectiveIcon,
  GithubLogoIcon, KeyIcon, VaultIcon, XIcon,
} from '@phosphor-icons/react';
import type { FullState, Commit } from '../types';
import type { Focus } from '../App';
import { ago, fmtSecs, middle, short } from '../util';
import { ZkVerify } from './ZkVerify';

const ICON = { size: 18, weight: 'light' as const };

export function Stage({ state, focus, now, onLeak }: { state: FullState; focus: Focus; now: number; onLeak: () => void }) {
  const idx = state.steps.findIndex((s) => s.id === focus);
  const step = idx >= 0 ? state.steps[idx] : undefined;
  const isLiveNarration = focus === 'idle' || focus === 'resolved' || step?.status === 'running' || isLast(state, focus);
  const title = isLiveNarration ? state.narration.title : step?.title ?? '';
  const body = isLiveNarration ? state.narration.body : step?.explain ?? '';

  return (
    <>
      <div className="stage-head">
        <span className="big-num">{focus === 'idle' ? '00' : focus === 'resolved' ? '✓' : String(idx + 1).padStart(2, '0')}</span>
        <div>
          <div className="eyebrow">{focus === 'idle' ? 'Before the incident' : focus === 'resolved' ? 'After the incident' : `Chapter ${idx + 1} · ${step?.tool}`}</div>
          <h1 className="headline">{title}</h1>
          <p className="lede">{body}</p>
        </div>
      </div>
      <div className="scene">{scene(state, focus, now, onLeak)}</div>
    </>
  );
}

function isLast(s: FullState, f: Focus) {
  const touched = s.steps.filter((x) => x.status !== 'idle');
  return touched.at(-1)?.id === f;
}

function scene(s: FullState, f: Focus, now: number, onLeak: () => void): ReactNode {
  switch (f) {
    case 'idle': return <IdleScene s={s} onLeak={onLeak} />;
    case 'leak': return <LeakScene s={s} />;
    case 'detect': return <DetectScene s={s} now={now} />;
    case 'rotate': return <VaultScene s={s} />;
    case 'redeploy': return <AppScene s={s} now={now} />;
    case 'revoke': return <AttackScene s={s} />;
    case 'clean': return <CleanScene s={s} />;
    case 'verify': return <VerifyScene s={s} />;
    case 'prove': return <ZkVerify s={s} />;
    case 'resolved': return <ResolvedScene s={s} />;
  }
}

/* ---------- scenes ---------- */

function IdleScene({ s, onLeak }: { s: FullState; onLeak: () => void }) {
  const v = s.vault.versions.at(-1);
  return (
    <div className="col gap-l">
      <div className="flow">
        <FlowNode icon={<VaultIcon {...ICON} />} label="HashiCorp Vault" value={v ? `key v${v.version} · ${v.keyMasked}` : '-'} />
        <FlowArrow label="AppRole, read-only" />
        <FlowNode icon={<CubeIcon {...ICON} />} label="Production app" value={s.app.status} tone={s.app.status === 'healthy' ? 'safe' : undefined} />
        <FlowArrow label="API key" />
        <FlowNode icon={<KeyIcon {...ICON} />} label="Gemini API" value={s.app.upstreamOk ? 'accepting calls' : '-'} />
      </div>
      <p className="muted">The key lives only in Vault. It is not in the code, and it is not on GitHub.</p>
      <div><button className="btn primary lg" disabled={s.busy} onClick={onLeak}>Simulate the leak <ArrowRightIcon size={16} /></button></div>
    </div>
  );
}

function LeakScene({ s }: { s: FullState }) {
  const c = s.repo.commits.find((x) => x.sha === s.incident.leakCommit) ?? s.repo.previousCommits?.find((x) => x.sha === s.incident.leakCommit);
  return (
    <div className="card code">
      <div className="card-bar">
        <GithubLogoIcon {...ICON} /> <span>{s.repo.fullName}</span>
        <span className="muted">· commit {short(s.incident.leakCommit)}</span>
        <span className="right muted">{c?.author ?? 'intern'}</span>
      </div>
      <div className="diff-file">config/production.env</div>
      <pre className="diff">
        <span className="ln add">+ # quick fix so it works on my machine, will remove later</span>
        <span className="ln add">+ PORT=3000</span>
        <span className="ln add hot">+ GEMINI_API_KEY={s.incident.leakedKeyMasked ?? 'AIza…'}</span>
      </pre>
      <div className="card-foot muted">“{c?.message ?? 'add prod config so the demo works on my machine'}”</div>
    </div>
  );
}

function DetectScene({ s, now }: { s: FullState; now: number }) {
  const run = s.actions.find((r) => r.headSha === s.incident.leakCommit);
  const f = s.incident.findings[0];
  return (
    <div className="col gap-m">
      <div className="card row-card">
        <GithubLogoIcon {...ICON} />
        <div className="grow">
          <div className="strong">GitHub Actions · LeakGuard secret scan {run ? `#${run.runNumber}` : ''}</div>
          <div className="muted small">gitleaks scans the whole history on every push</div>
        </div>
        <RunBadge status={run?.status} conclusion={run?.conclusion ?? null} />
        {run && <a className="link" href={run.url} target="_blank" rel="noreferrer"><ArrowUpRightIcon size={16} /></a>}
      </div>
      {f ? (
        <motion.div className="card finding" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="eyebrow bad">Finding</div>
          <dl className="kv">
            <dt>Rule</dt><dd>{f.ruleId}</dd>
            <dt>Where</dt><dd>{f.file}:{f.line}</dd>
            <dt>Commit</dt><dd>{short(f.commit)} by {f.author}</dd>
            <dt>Secret</dt><dd className="bad">{f.secretMasked}</dd>
          </dl>
        </motion.div>
      ) : (
        <p className="muted">Waiting for the CI job… {run ? `started ${ago(run.createdAt, now)}` : 'GitHub is scheduling a runner'}</p>
      )}
    </div>
  );
}

function VaultScene({ s }: { s: FullState }) {
  return (
    <div className="card">
      <div className="card-bar"><VaultIcon {...ICON} /> <span>{s.vault.path}</span><span className="right muted">KV v2</span></div>
      <ul className="versions">
        {[...s.vault.versions].reverse().map((v) => (
          <motion.li key={v.version} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className={`ver ver-${v.status}`}>
            <span className="ver-n">v{v.version}</span>
            <span className="mono">{v.keyMasked}</span>
            <span className="muted small grow">{v.reason}</span>
            <span className={`tag tag-${v.status}`}>{v.status}</span>
          </motion.li>
        ))}
      </ul>
      <div className="card-foot muted">The new key is stored first; the leaked one is deleted only after production has switched to it.</div>
    </div>
  );
}

function AppScene({ s, now }: { s: FullState; now: number }) {
  const a = s.app;
  return (
    <div className="card">
      <div className="card-bar"><CubeIcon {...ICON} /> <span>leakguard-demo-app</span><span className="right muted mono">{a.containerId ?? '-'}</span></div>
      <div className="app-grid">
        <Stat label="Status" value={a.status} tone={a.status === 'healthy' ? 'safe' : a.status === 'restarting' ? 'warn' : 'bad'} />
        <Stat label="Key in use" value={a.keyVersion ? `v${a.keyVersion} · ${a.keyMasked}` : '-'} />
        <Stat label="Started" value={ago(a.startedAt, now)} />
      </div>
      <blockquote className="quote">{a.aiMessage ?? '…'}</blockquote>
      <div className="card-foot muted">{a.vaultAuth ?? 'Authenticating to Vault…'}</div>
    </div>
  );
}

function AttackScene({ s }: { s: FullState }) {
  const atk = s.attacker;
  return (
    <div className="card term">
      <div className="card-bar"><DetectiveIcon {...ICON} /> <span>attacker-bot</span><span className="right muted">using {atk.keyMasked ?? '-'}</span></div>
      <ul className="term-lines">
        {atk.attempts.slice(-7).map((x) => (
          <motion.li key={x.t} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={x.status === 200 ? 'bad' : 'safe'}>
            <span className="mono">{x.status}</span> <span>{x.status === 200 ? 'Gemini answered, on our bill' : 'Rejected: API key not valid'}</span>
          </motion.li>
        ))}
      </ul>
      <div className="card-foot"><span className="bad">{atk.successCount} stolen calls</span> · <span className="safe">{atk.deniedCount} blocked</span></div>
    </div>
  );
}

function CleanScene({ s }: { s: FullState }) {
  const before = s.repo.previousCommits ?? [];
  return (
    <div className="compare">
      <CommitList title="Before" commits={before} struck />
      <ArrowRightIcon size={22} weight="thin" className="muted compare-arrow" />
      <CommitList title="After" commits={s.repo.commits} />
    </div>
  );
}

function CommitList({ title, commits, struck }: { title: string; commits: Commit[]; struck?: boolean }) {
  return (
    <div className="card grow">
      <div className="eyebrow">{title}</div>
      <ul className="commits">
        {commits.slice(0, 4).map((c) => (
          <li key={c.sha} className={c.dirty ? 'dirty' : ''}>
            <span className={`mono ${struck && c.dirty ? 'struck' : ''}`}>{c.short}</span>
            <span className="grow ellipsis">{c.message}</span>
            {c.dirty ? <span className="tag tag-revoked">secret</span> : <span className="tag tag-active">clean</span>}
          </li>
        ))}
        {!commits.length && <li className="muted">-</li>}
      </ul>
    </div>
  );
}

function VerifyScene({ s }: { s: FullState }) {
  const v = s.steps.find((x) => x.id === 'verify')!;
  const head = s.repo.commits[0]?.sha;
  const ci = s.actions.find((r) => r.headSha === head);
  return (
    <ul className="checks">
      <Check ok label="Local gitleaks scan of every commit" detail="0 findings" />
      <Check ok={ci?.conclusion === 'success'} pending={!ci || ci.status !== 'completed'} label="GitHub Actions re-scan after force-push" detail={ci ? `run #${ci.runNumber} · ${ci.conclusion ?? ci.status.replace('_', ' ')}` : 'starting'} />
      <Check ok={v.status === 'done'} pending={v.status === 'running'} label="No commit on main contains the secret" detail={`HEAD ${short(head)}`} />
    </ul>
  );
}

function ResolvedScene({ s }: { s: FullState }) {
  const inc = s.incident;
  const t = (x?: number) => (x && inc.leakedAt ? fmtSecs(x - inc.leakedAt) : '-');
  const clean = s.steps.find((x) => x.id === 'clean')?.endedAt;
  return (
    <div className="col gap-l">
      <div className="summary">
        <Big label="Leak → key dead" value={t(inc.revokedAt)} />
        <Big label="Leak → history clean" value={t(clean)} />
        <Big label="Leak → proof" value={t(inc.resolvedAt)} />
        <Big label="Downtime" value="0s" />
      </div>
      <p className="muted">
        {inc.pacedMs ? `Times include ${fmtSecs(inc.pacedMs)} of presentation pauses so each chapter stays readable. ` : ''}
        Leaked secrets often stay valid for days. Click any chapter on the left to replay what happened.
      </p>
      <ZkVerify s={s} compact />
    </div>
  );
}

/* ---------- small pieces ---------- */

function FlowNode({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="flow-node">
      <div className="flow-icon">{icon}</div>
      <div className="small muted">{label}</div>
      <div className={`flow-val ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flow-arrow">
      <span className="dash" />
      <span className="small muted">{label}</span>
    </div>
  );
}

function RunBadge({ status, conclusion }: { status?: string; conclusion: string | null }) {
  if (!status || status !== 'completed') return <span className="tag tag-warn"><CircleNotchIcon size={13} className="spinning" /> {status ? status.replace('_', ' ') : 'queued'}</span>;
  return conclusion === 'success' ? <span className="tag tag-active">clean</span> : <span className="tag tag-revoked">secret found</span>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="stat">
      <div className="small muted">{label}</div>
      <div className={`stat-v ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="big">
      <div className="big-v">{value}</div>
      <div className="small muted">{label}</div>
    </div>
  );
}

function Check({ ok, pending, label, detail }: { ok: boolean; pending?: boolean; label: string; detail: string }) {
  return (
    <li className={`check ${pending ? 'pending' : ok ? 'ok' : 'no'}`}>
      <span className="check-mark">{pending ? <CircleNotchIcon size={16} className="spinning" /> : ok ? <CheckIcon size={16} /> : <XIcon size={16} />}</span>
      <span className="grow">{label}</span>
      <span className="muted small mono">{middle(detail, 24)}</span>
    </li>
  );
}
