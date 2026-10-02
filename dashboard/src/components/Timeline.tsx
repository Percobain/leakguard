import { motion } from 'framer-motion';
import type { FullState, StepId } from '../types';
import { fmtSecs } from '../util';

export default function Timeline({ state, now }: { state: FullState; now: number }) {
  const { incident, timeline, steps } = state;
  const start = incident.leakedAt ?? timeline[0]?.t;

  if (!start) {
    return (
      <footer className="timeline">
        <div className="tl-empty">Timeline: waiting for a leak. Press <b>Leak a key</b> to start the demo.</div>
      </footer>
    );
  }

  const lastEvent = timeline.reduce((m, e) => Math.max(m, e.t), start);
  const end = incident.resolvedAt ? Math.max(lastEvent, incident.resolvedAt) : Math.max(now, lastEvent);
  const span = Math.max(10_000, (end - start) * 1.06);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));

  const stepEnd = (id: StepId) => steps.find((s) => s.id === id && s.status === 'done')?.endedAt;
  const dead = incident.revokedAt;
  const cleaned = stepEnd('clean');
  const proved = stepEnd('prove');

  // Axis ticks every "nice" interval.
  const niceSteps = [5, 10, 15, 30, 60, 120, 300, 600].map((s) => s * 1000);
  const tick = niceSteps.find((s) => span / s <= 8) ?? 600_000;
  const ticks: number[] = [];
  for (let t = 0; t <= span; t += tick) ticks.push(t);

  return (
    <footer className="timeline">
      <div className="tl-head">
        <span className="tl-title">Incident timeline</span>
        {incident.leakedAt && (
          <span className="mttr">
            <span>Leak → key dead: <b className={dead ? 'good' : 'bad'}>{dead ? fmtSecs(dead - incident.leakedAt) : `${fmtSecs(now - incident.leakedAt)}…`}</b></span>
            <span>· → history clean: <b>{cleaned ? fmtSecs(cleaned - incident.leakedAt) : '—'}</b></span>
            <span>· → proof: <b>{proved ? fmtSecs(proved - incident.leakedAt) : '—'}</b></span>
            <span className="vs">vs industry average to remediate a leaked secret: <b>days</b></span>
          </span>
        )}
      </div>
      <div className="tl-track">
        <div className="tl-axis" />
        {dead ? (
          <div className="tl-exposed" style={{ left: '0%', width: `${pct(dead)}%` }} />
        ) : (
          <div className="tl-exposed live" style={{ left: '0%', width: `${pct(now)}%` }} />
        )}
        {ticks.map((t) => (
          <div key={t} className="tl-tick" style={{ left: `${(t / span) * 100}%` }}>
            <span>T+{Math.round(t / 1000)}s</span>
          </div>
        ))}
        {timeline.map((e, i) => (
          <motion.div
            key={`${e.t}-${i}`}
            className={`tl-event k-${e.kind} ${i % 2 ? 'low' : 'high'}`}
            style={{ left: `${pct(e.t)}%` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <span className="tl-dot" />
            <span className="tl-label">
              {e.label} <em>T+{fmtSecs(e.t - start)}</em>
            </span>
          </motion.div>
        ))}
        {!incident.resolvedAt && <div className="tl-now" style={{ left: `${pct(now)}%` }} />}
      </div>
    </footer>
  );
}
