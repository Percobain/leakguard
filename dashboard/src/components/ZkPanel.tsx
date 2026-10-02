import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sigma, Loader2, Download, BadgeCheck } from 'lucide-react';
import type { ZkState } from '../types';
import { fmtSecs, middle } from '../util';
import Panel from './Panel';

declare global {
  interface Window {
    snarkjs?: {
      groth16: { verify: (vkey: unknown, publicSignals: string[], proof: unknown) => Promise<boolean> };
    };
  }
}

let snarkjsLoading: Promise<void> | null = null;
function loadSnarkjs(): Promise<void> {
  if (window.snarkjs) return Promise.resolve();
  if (!snarkjsLoading) {
    snarkjsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/snarkjs.min.js';
      s.onload = () => resolve();
      s.onerror = () => {
        snarkjsLoading = null;
        reject(new Error('could not load /snarkjs.min.js'));
      };
      document.head.appendChild(s);
    });
  }
  return snarkjsLoading;
}

type Verdict = { state: 'idle' } | { state: 'checking' } | { state: 'done'; valid: boolean; ms: number } | { state: 'error'; msg: string };

export default function ZkPanel({ zk, explain }: { zk: ZkState; explain: boolean }) {
  const [verdict, setVerdict] = useState<Verdict>({ state: 'idle' });

  // A new proof invalidates the previous browser verdict.
  useEffect(() => setVerdict({ state: 'idle' }), [zk.provedAt, zk.status]);

  const verify = async () => {
    if (!zk.proof || !zk.rawPublicSignals) return;
    setVerdict({ state: 'checking' });
    try {
      const t0 = performance.now();
      const [, vkRes] = await Promise.all([loadSnarkjs(), fetch('/api/zk/verification_key.json')]);
      if (!vkRes.ok) throw new Error(`verification key: ${vkRes.status}`);
      const vkey = await vkRes.json();
      const valid = await window.snarkjs!.groth16.verify(vkey, zk.rawPublicSignals, zk.proof);
      setVerdict({ state: 'done', valid, ms: performance.now() - t0 });
    } catch (e) {
      setVerdict({ state: 'error', msg: (e as Error).message });
    }
  };

  const tone = zk.status === 'proved' ? 'good' : zk.status === 'failed' ? 'bad' : zk.status === 'proving' ? 'warn' : 'neutral';
  const ps = zk.publicSignals;

  return (
    <Panel
      area="zk"
      icon={<Sigma size={20} />}
      title="Zero-knowledge proof"
      subtitle="Circom + snarkjs · Groth16"
      tone={tone}
      explain={
        explain &&
        'A mathematical proof that the private repo does not contain the leaked key, and it reveals none of the code. Anyone can check it, and nobody can fake it.'
      }
    >
      <div className={`zk-status zs-${zk.status}`}>
        {zk.status === 'idle' && <>No proof yet</>}
        {zk.status === 'proving' && (
          <>
            <Loader2 size={18} className="spin" /> Generating proof… computing witness and Groth16 proof
          </>
        )}
        {zk.status === 'proved' && (
          <>
            <BadgeCheck size={20} /> Proof generated{zk.durationMs !== undefined && <> in {fmtSecs(zk.durationMs)}</>}
          </>
        )}
        {zk.status === 'failed' && <>✗ Can't prove a lie: key still in repo</>}
      </div>
      {zk.status === 'failed' && zk.error && <div className="zk-error">{zk.error}</div>}

      <div className="zk-actions">
        <button className="btn btn-green" disabled={zk.status !== 'proved' || verdict.state === 'checking'} onClick={verify}>
          {verdict.state === 'checking' ? <Loader2 size={16} className="spin" /> : '✔'} Verify in my browser
        </button>
        <a className={`btn btn-ghost ${zk.status !== 'proved' ? 'disabled' : ''}`} href="/api/zk/proof.json" download="proof.json">
          <Download size={16} /> proof.json
        </a>
      </div>

      <AnimatePresence>
        {verdict.state === 'done' && (
          <motion.div
            className={`verdict ${verdict.valid ? 'valid' : 'invalid'}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <div className="verdict-big">{verdict.valid ? '✅ VALID' : '❌ INVALID'}</div>
            <div className="verdict-small">
              verified locally in your browser in {fmtSecs(verdict.ms)}. Our server was not involved.
            </div>
          </motion.div>
        )}
        {verdict.state === 'error' && (
          <motion.div className="zk-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            verification error: {verdict.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {ps && (
        <div className="zk-signals">
          <div><span>public · repo commitment</span><code title={ps.commitment}>{middle(ps.commitment, 12)}</code></div>
          <div><span>public · hash(leaked key)</span><code title={ps.leakedKeyHash}>{middle(ps.leakedKeyHash, 12)}</code></div>
          <div><span>public · bound to commit</span><code title={ps.commitShaHex}>{ps.commitShaHex?.slice(0, 12)}</code></div>
          <div><span>private · repo tokens</span><code>{zk.tokenCount ?? '—'} hidden values (never revealed)</code></div>
        </div>
      )}
    </Panel>
  );
}
