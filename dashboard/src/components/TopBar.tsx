import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Shield, Bomb, RotateCcw, Sigma, Cloud, CloudCog, Lightbulb } from 'lucide-react';
import type { FullState } from '../types';
import type { ConnState } from '../useLeakGuard';
import { post } from '../useLeakGuard';
import { fmtClock } from '../util';

interface Props {
  state: FullState;
  now: number;
  conn: ConnState;
  explain: boolean;
  setExplain: (v: boolean) => void;
  onError: (msg: string | null) => void;
}

const STATUS_LABEL: Record<FullState['incident']['status'], string> = {
  idle: 'ALL CLEAR',
  exposed: 'SECRET EXPOSED',
  remediating: 'REMEDIATING',
  resolved: 'RESOLVED',
  failed: 'REMEDIATION FAILED',
};

export default function TopBar({ state, now, conn, explain, setExplain, onError }: Props) {
  const { incident } = state;
  const [pending, setPending] = useState<string | null>(null);
  const disabled = state.busy || conn !== 'open' || pending !== null;

  const run = async (path: string) => {
    setPending(path);
    onError(await post(path));
    setPending(null);
  };

  const Icon =
    incident.status === 'idle' || incident.status === 'resolved' ? ShieldCheck : incident.status === 'failed' ? ShieldAlert : Shield;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><Shield size={30} strokeWidth={2.4} /></div>
        <div>
          <div className="brand-name">LeakGuard</div>
          <div className="brand-tag">leaked-secret autopilot · incident #{incident.id || '—'}</div>
        </div>
      </div>

      <div className={`status-badge st-${incident.status}`}>
        <Icon size={22} />
        {STATUS_LABEL[incident.status]}
      </div>

      <ExposureTimer state={state} now={now} />

      <div className="top-right">
        <div className="chips">
          <span className={`chip mode-${state.mode.google}`} title="Which Google backend rotates the key">
            {state.mode.google === 'real' ? <Cloud size={15} /> : <CloudCog size={15} />}
            {state.mode.google === 'real' ? 'Real Google Cloud' : 'Simulated Google'}
          </span>
          <span className={`chip conn-${conn}`}>
            <span className="dot" />
            {conn === 'open' ? 'LIVE' : conn === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
          </span>
          <button
            className={`chip toggle ${explain ? 'on' : ''}`}
            onClick={() => setExplain(!explain)}
            title="Show plain-English explanations"
          >
            <Lightbulb size={15} /> Explain {explain ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="actions">
          <button className="btn btn-danger" disabled={disabled} onClick={() => run('/api/leak')}>
            <Bomb size={18} /> {pending === '/api/leak' ? 'Leaking…' : 'Leak a key'}
          </button>
          <button className="btn btn-ghost" disabled={disabled} onClick={() => run('/api/reset')}>
            <RotateCcw size={18} /> {pending === '/api/reset' ? 'Resetting…' : 'Reset demo'}
          </button>
          <button className="btn btn-violet" disabled={disabled} onClick={() => run('/api/zk/prove')}>
            <Sigma size={18} /> {pending === '/api/zk/prove' ? 'Proving…' : 'Try proving clean'}
          </button>
        </div>
      </div>
    </header>
  );
}

function ExposureTimer({ state, now }: { state: FullState; now: number }) {
  const { leakedAt, revokedAt } = state.incident;
  if (!leakedAt) {
    return (
      <div className="exposure ex-safe">
        <div className="ex-label">KEY EXPOSURE</div>
        <div className="ex-clock">00:00</div>
        <div className="ex-note">no secret in the wild</div>
      </div>
    );
  }
  if (revokedAt) {
    return (
      <div className="exposure ex-dead">
        <div className="ex-label">✓ LEAKED KEY IS DEAD</div>
        <div className="ex-clock">{fmtClock(revokedAt - leakedAt)}</div>
        <div className="ex-note">Key dead after {fmtClock(revokedAt - leakedAt)}</div>
      </div>
    );
  }
  return (
    <div className="exposure ex-live">
      <div className="ex-label"><span className="rec" /> KEY EXPOSED</div>
      <div className="ex-clock">{fmtClock(now - leakedAt)}</div>
      <div className="ex-note">anyone with the repo can use it right now</div>
    </div>
  );
}
