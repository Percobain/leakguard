import { AnimatePresence, motion } from 'framer-motion';
import { Container, Bot } from 'lucide-react';
import type { AppState } from '../types';
import { ago, short } from '../util';
import Panel from './Panel';

const LABEL: Record<AppState['status'], string> = {
  healthy: 'HEALTHY',
  degraded: 'DEGRADED',
  restarting: 'REDEPLOYING',
  down: 'DOWN',
};

export default function AppPanel({ app, now, explain }: { app: AppState; now: number; explain: boolean }) {
  const tone = app.status === 'healthy' ? 'good' : app.status === 'restarting' ? 'warn' : 'bad';

  return (
    <Panel
      area="app"
      icon={<Container size={20} />}
      title="Production app"
      subtitle="Docker container · Gemini-powered"
      tone={tone}
      right={
        <span className={`light l-${app.status}`}>
          <span className="dot" />
          {LABEL[app.status]}
        </span>
      }
      explain={explain && 'This is the real customer-facing app. LeakGuard swaps its key and restarts it, and customers never notice.'}
    >
      <div className="kv">
        <div><span>container</span><b className="mono">{short(app.containerId, 12)}</b></div>
        <div><span>started</span><b>{ago(app.startedAt, now)}</b></div>
        <div><span>key</span><b className="mono">{app.keyMasked ?? '—'} {app.keyVersion ? <em>(v{app.keyVersion})</em> : null}</b></div>
        <div>
          <span>Gemini API</span>
          <b className={app.upstreamOk ? 'ok' : app.upstreamOk === false ? 'bad' : ''}>
            {app.upstreamOk === undefined ? '—' : app.upstreamOk ? '✓ responding' : '✗ failing'}
          </b>
        </div>
        <div><span>vault auth</span><b>{app.vaultAuth ?? '—'}</b></div>
        <div><span>health check</span><b>{ago(app.lastCheck, now)}</b></div>
      </div>
      <AnimatePresence mode="wait">
        {app.aiMessage && (
          <motion.div
            key={app.aiMessage}
            className="bubble"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Bot size={18} />
            <span>{app.aiMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
