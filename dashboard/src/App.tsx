import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLeakGuard, useNow, post } from './useLeakGuard';
import { fmtClock } from './util';
import type { FullState, StepId } from './types';
import { Story } from './components/Story';
import { Stage } from './components/Stage';
import { Vitals } from './components/Vitals';
import { LogDrawer } from './components/LogDrawer';

export type Focus = StepId | 'idle' | 'resolved';

/** Which chapter the stage should show while following the live incident. */
function liveFocus(s: FullState): Focus {
  if (s.incident.status === 'resolved') return 'resolved';
  const running = s.steps.find((x) => x.status === 'running');
  if (running) return running.id;
  const done = [...s.steps].reverse().find((x) => x.status === 'done' || x.status === 'failed');
  return done ? done.id : 'idle';
}

export default function App() {
  const { state, conn, offsetRef } = useLeakGuard();
  const now = useNow(offsetRef, 200);
  const [pinned, setPinned] = useState<Focus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const live = state ? liveFocus(state) : 'idle';
  const focus = pinned ?? live;

  // Unpin automatically when a new incident starts.
  const incidentId = state?.incident.id;
  useEffect(() => setPinned(null), [incidentId]);

  const act = async (path: string) => {
    setPinned(null);
    const err = await post(path);
    if (err) {
      setToast(err);
      window.setTimeout(() => setToast(null), 4000);
    }
  };

  const exposure = useMemo(() => {
    const inc = state?.incident;
    if (!inc?.leakedAt) return { label: 'No exposure', value: '00:00', tone: 'calm' as const };
    if (inc.revokedAt) return { label: 'Key was usable for', value: fmtClock(inc.revokedAt - inc.leakedAt), tone: 'safe' as const };
    return { label: 'Key exposed for', value: fmtClock(now - inc.leakedAt), tone: 'bad' as const };
  }, [state?.incident, now]);

  if (!state) {
    return (
      <div className="boot">
        <div className="wordmark">LeakGuard</div>
        <p className="muted">{conn === 'closed' ? 'Orchestrator offline, retrying…' : 'Connecting…'}</p>
      </div>
    );
  }

  const status = state.incident.status;
  const headline =
    status === 'idle' ? 'All quiet' : status === 'exposed' ? 'Secret exposed' : status === 'remediating' ? 'Responding' : status === 'resolved' ? 'Resolved' : 'Needs attention';

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className={`dot dot-${status}`} />
          <span className="wordmark">LeakGuard</span>
          <span className="sep">/</span>
          <span className="muted">incident {String(state.incident.id).padStart(2, '0')}</span>
          <span className={`pill pill-${status}`}>{headline}</span>
        </div>
        <div className={`clock clock-${exposure.tone}`}>
          <span className="clock-label">{exposure.label}</span>
          <span className="clock-value">{exposure.value}</span>
        </div>
        <div className="actions">
          <span className="mode">{state.mode.google === 'real' ? 'Google · live' : 'Google · simulated'}</span>
          <span className={`conn conn-${conn}`} title={`WebSocket ${conn}`} />
          <button className="btn ghost" disabled={state.busy} onClick={() => act('/api/zk/prove')}>Try proving clean</button>
          <button className="btn ghost" disabled={state.busy} onClick={() => act('/api/reset')}>Reset</button>
          <button className="btn primary" disabled={state.busy} onClick={() => act('/api/leak')}>Leak a key</button>
        </div>
      </header>

      <main className="main">
        <Story state={state} focus={focus} live={live} now={now} onPick={(f) => setPinned(f === live ? null : f)} />
        <section className="stage-wrap">
          {pinned && (
            <button className="follow" onClick={() => setPinned(null)}>
              Viewing an earlier chapter · <u>follow live</u>
            </button>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={focus}
              className="stage"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Stage state={state} focus={focus} now={now} onLeak={() => act('/api/leak')} />
            </motion.div>
          </AnimatePresence>
          <Vitals state={state} now={now} />
        </section>
      </main>

      <LogDrawer state={state} open={logOpen} onToggle={() => setLogOpen((o) => !o)} />

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
