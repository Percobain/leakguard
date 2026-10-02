import { Fragment } from 'react';
import { motion } from 'framer-motion';
import {
  GitCommitHorizontal, ScanSearch, KeyRound, Container, Ban, Eraser, ShieldCheck, Sigma,
  Check, X, Loader2, type LucideIcon,
} from 'lucide-react';
import type { Step, StepId } from '../types';
import { fmtSecs } from '../util';

const ICONS: Record<StepId, LucideIcon> = {
  leak: GitCommitHorizontal,
  detect: ScanSearch,
  rotate: KeyRound,
  redeploy: Container,
  revoke: Ban,
  clean: Eraser,
  verify: ShieldCheck,
  prove: Sigma,
};

export default function Pipeline({ steps, now, explain }: { steps: Step[]; now: number; explain: boolean }) {
  return (
    <section className="pipeline">
      {steps.map((s, i) => {
        const Icon = ICONS[s.id] ?? ShieldCheck;
        const dur = s.startedAt ? (s.endedAt ?? now) - s.startedAt : undefined;
        const next = steps[i + 1];
        let conn = 'idle';
        if (next) {
          if (next.status === 'running') conn = 'active';
          else if (s.status === 'done' && (next.status === 'done' || next.status === 'skipped')) conn = 'done';
          else if (s.status === 'failed' || next.status === 'failed') conn = 'failed';
        }
        // The leak step is "bad" by nature: render it red when it happened.
        const tone = s.id === 'leak' && s.status === 'done' ? 'leaked' : s.status;
        return (
          <Fragment key={s.id}>
            <motion.div className={`step step-${tone}`} layout title={s.explain}>
              <div className="step-top">
                <span className="step-num">{i + 1}</span>
                <span className="step-icon"><Icon size={26} /></span>
                <span className="step-state">
                  {s.status === 'running' && <Loader2 size={18} className="spin" />}
                  {s.status === 'done' && (s.id === 'leak' ? <X size={18} /> : <Check size={18} />)}
                  {s.status === 'failed' && <X size={18} />}
                  {s.status === 'skipped' && <span className="skip">skip</span>}
                </span>
              </div>
              <div className="step-title">{s.title}</div>
              <div className="step-tool">{s.tool}</div>
              <div className="step-detail">
                {s.detail ?? (s.status === 'idle' ? 'waiting' : s.status)}
              </div>
              {dur !== undefined && <div className="step-dur">{fmtSecs(dur)}</div>}
              {explain && <div className="step-explain">{s.explain}</div>}
            </motion.div>
            {next && (
              <div className={`connector conn-${conn}`}>
                <span />
              </div>
            )}
          </Fragment>
        );
      })}
    </section>
  );
}
