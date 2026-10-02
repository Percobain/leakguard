import { AnimatePresence, motion } from 'framer-motion';
import { Skull } from 'lucide-react';
import type { AttackerState } from '../types';
import { clockTime, short } from '../util';
import Panel from './Panel';

export default function AttackerPanel({ attacker, explain }: { attacker: AttackerState; explain: boolean }) {
  const tone = attacker.status === 'has-key' ? 'bad' : attacker.status === 'blocked' ? 'good' : 'neutral';
  const recent = attacker.attempts.slice(-14);
  const spark = attacker.attempts.slice(-60);

  const statusLine =
    attacker.status === 'scanning' ? (
      <span className="atk-scan">▸ scanning GitHub for secrets<span className="blink">_</span></span>
    ) : attacker.status === 'has-key' ? (
      <span className="atk-has">☠ KEY HARVESTED {attacker.keyMasked} from commit {short(attacker.sourceCommit)}</span>
    ) : (
      <span className="atk-blocked">✋ BLOCKED: the stolen key no longer works</span>
    );

  return (
    <Panel
      area="attacker"
      icon={<Skull size={20} />}
      title="Attacker's view"
      subtitle="a bot that scrapes GitHub for keys"
      tone={tone}
      explain={
        explain &&
        'This simulates a real criminal bot. Bots find leaked keys on GitHub within seconds, then use them to call the paid API on your bill.'
      }
      className="attacker"
    >
      <div className="term">
        <div className="term-status">{statusLine}</div>
        <div className="term-lines">
          {recent.length === 0 && <div className="term-dim">$ waiting for a key to steal…</div>}
          <AnimatePresence initial={false}>
            {recent.map((a) => {
              const ok = a.status >= 200 && a.status < 300;
              return (
                <motion.div
                  key={a.t + a.keyMasked + a.status}
                  className={`term-line ${ok ? 'pwned' : 'denied'}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <span className="term-time">{clockTime(a.t)}</span>
                  <span className="term-cmd">POST gemini?key={a.keyMasked}</span>
                  <span className="term-code">{a.status}</span>
                  <span className="term-msg">{a.message}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <div className="atk-counters">
        <div className="counter c-bad">
          <div className="counter-num">{attacker.successCount}</div>
          <div className="counter-label">calls the attacker got through</div>
        </div>
        <div className="counter c-good">
          <div className="counter-num">{attacker.deniedCount}</div>
          <div className="counter-label">calls blocked</div>
        </div>
      </div>

      <div className="spark" title="Last 60 attacker requests (red = abuse succeeded, green = blocked)">
        {Array.from({ length: 60 }).map((_, i) => {
          const a = spark[i - (60 - spark.length)];
          const cls = !a ? 'empty' : a.status >= 200 && a.status < 300 ? 'pwned' : 'denied';
          return <span key={i} className={`spark-bar ${cls}`} />;
        })}
      </div>
    </Panel>
  );
}
