import { AnimatePresence, motion } from 'framer-motion';
import { Workflow, Loader2, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';
import type { ActionsRun } from '../types';
import { ago, short } from '../util';
import Panel from './Panel';

export default function ActionsPanel({ runs, now, explain }: { runs: ActionsRun[]; now: number; explain: boolean }) {
  const active = runs.some((r) => r.status !== 'completed');
  const latest = runs[0];
  const tone = active ? 'warn' : latest?.conclusion === 'failure' ? 'bad' : latest?.conclusion === 'success' ? 'good' : 'neutral';

  return (
    <Panel
      area="actions"
      icon={<Workflow size={20} />}
      title="GitHub Actions"
      subtitle="gitleaks scan on every push"
      tone={tone}
      explain={explain && 'Every push starts a CI job that runs gitleaks. A red run means it found a secret, and that triggers LeakGuard.'}
    >
      {runs.length === 0 && <div className="empty">no workflow runs yet</div>}
      <ul className="runs">
        <AnimatePresence initial={false}>
          {runs.slice(0, 6).map((r) => {
            const done = r.status === 'completed';
            const failed = done && r.conclusion === 'failure';
            const ok = done && r.conclusion === 'success';
            return (
              <motion.li
                key={r.id}
                className={`run ${!done ? 'running' : failed ? 'failed' : ok ? 'ok' : ''}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                layout
              >
                <span className="run-icon">
                  {!done ? (
                    r.status === 'queued' ? <Clock size={20} /> : <Loader2 size={20} className="spin" />
                  ) : failed ? (
                    <XCircle size={20} />
                  ) : ok ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <Clock size={20} />
                  )}
                </span>
                <span className="run-main">
                  <span className="run-name">#{r.runNumber} {r.name}</span>
                  <span className="run-meta">
                    {short(r.headSha)} · {ago(r.createdAt, now)}
                  </span>
                </span>
                <span className="run-verdict">
                  {!done ? r.status.replace('_', ' ') : failed ? 'secret found' : ok ? 'clean' : r.conclusion ?? 'done'}
                </span>
                {r.url && (
                  <a className="link" href={r.url} target="_blank" rel="noreferrer" title="Open on GitHub">
                    <ExternalLink size={14} />
                  </a>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}
