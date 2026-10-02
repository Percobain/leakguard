import type { FullState } from '../types';
import type { Focus } from '../App';
import { fmtSecs } from '../util';

/** Left rail: the incident as eight numbered chapters, read top to bottom. */
export function Story({ state, focus, live, now, onPick }: { state: FullState; focus: Focus; live: Focus; now: number; onPick: (f: Focus) => void }) {
  const doneCount = state.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const progress = state.incident.status === 'resolved' ? 1 : doneCount / state.steps.length;

  return (
    <nav className="story">
      <div className="story-head">
        <span className="eyebrow">The story</span>
        <span className="muted small">{doneCount}/8</span>
      </div>
      <ol className="chapters">
        <span className="rail"><span className="rail-fill" style={{ height: `${progress * 100}%` }} /></span>
        {state.steps.map((s, i) => {
          const active = focus === s.id;
          const isLive = live === s.id && s.status === 'running';
          const dur = s.startedAt ? (s.endedAt ?? now) - s.startedAt : 0;
          const tone = s.id === 'leak' && s.status === 'done' ? 'bad' : s.status;
          return (
            <li key={s.id} className={`chapter ch-${tone} ${active ? 'active' : ''}`} onClick={() => s.status !== 'idle' && onPick(s.id)}>
              <span className="node">{s.status === 'running' ? <span className="spin" /> : null}</span>
              <div className="ch-body">
                <div className="ch-row">
                  <span className="ch-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ch-title">{s.title}</span>
                  {s.status !== 'idle' && <span className="ch-time">{isLive ? fmtSecs(dur) : s.status === 'skipped' ? 'skipped' : fmtSecs(dur)}</span>}
                </div>
                <div className="ch-tool">{s.tool}</div>
                {active && <p className="ch-explain">{s.explain}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
