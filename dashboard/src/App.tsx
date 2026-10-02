import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLeakGuard, useNow } from './useLeakGuard';
import TopBar from './components/TopBar';
import Narrator from './components/Narrator';
import Pipeline from './components/Pipeline';
import AttackerPanel from './components/AttackerPanel';
import GitPanel from './components/GitPanel';
import ActionsPanel from './components/ActionsPanel';
import VaultPanel from './components/VaultPanel';
import AppPanel from './components/AppPanel';
import ZkPanel from './components/ZkPanel';
import LogPanel from './components/LogPanel';
import Timeline from './components/Timeline';

export default function App() {
  const { state, conn, offsetRef } = useLeakGuard();
  const now = useNow(offsetRef);
  const [explain, setExplain] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string | null) => {
    if (!msg) return;
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 5000);
  };

  if (!state) {
    return (
      <div className="boot">
        <div className="boot-logo">🛡️</div>
        <h1>LeakGuard</h1>
        <p>{conn === 'closed' ? 'Waiting for the orchestrator…' : 'Connecting to mission control…'}</p>
        <div className="boot-bar"><span /></div>
      </div>
    );
  }

  const phase = state.incident.status;

  return (
    <div className={`shell phase-${phase}`}>
      <TopBar state={state} now={now} conn={conn} explain={explain} setExplain={setExplain} onError={notify} />
      <Narrator narration={state.narration} phase={phase} />
      <Pipeline steps={state.steps} now={now} explain={explain} />
      <main className="grid">
        <AttackerPanel attacker={state.attacker} explain={explain} />
        <GitPanel repo={state.repo} now={now} explain={explain} />
        <ActionsPanel runs={state.actions} now={now} explain={explain} />
        <VaultPanel vault={state.vault} now={now} explain={explain} />
        <AppPanel app={state.app} now={now} explain={explain} />
        <ZkPanel zk={state.zk} explain={explain} />
        <LogPanel logs={state.logs} />
      </main>
      <Timeline state={state} now={now} />
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            onClick={() => setToast(null)}
          >
            ⚠ {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
