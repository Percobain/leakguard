import { useState } from 'react';
import { CheckIcon, DownloadSimpleIcon, FingerprintIcon, XIcon } from '@phosphor-icons/react';
import type { FullState } from '../types';
import { middle } from '../util';

declare global {
  interface Window {
    snarkjs?: { groth16: { verify: (vkey: unknown, publicSignals: string[], proof: unknown) => Promise<boolean> } };
  }
}

let loading: Promise<void> | null = null;
function loadSnarkjs(): Promise<void> {
  if (window.snarkjs) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = '/snarkjs.min.js';
    el.onload = () => resolve();
    el.onerror = () => { loading = null; reject(new Error('could not load snarkjs')); };
    document.head.appendChild(el);
  });
  return loading;
}

type Verdict = { state: 'none' } | { state: 'checking' } | { state: 'done'; valid: boolean; ms: number } | { state: 'error'; msg: string };

/** The proof, its public inputs, and a button that verifies it locally in the browser. */
export function ZkVerify({ s, compact }: { s: FullState; compact?: boolean }) {
  const zk = s.zk;
  const [verdict, setVerdict] = useState<Verdict>({ state: 'none' });

  const verify = async () => {
    if (!zk.proof || !zk.rawPublicSignals) return;
    setVerdict({ state: 'checking' });
    try {
      await loadSnarkjs();
      const vkey = await (await fetch('/api/zk/verification_key.json')).json();
      const t0 = performance.now();
      const valid = await window.snarkjs!.groth16.verify(vkey, zk.rawPublicSignals, zk.proof);
      setVerdict({ state: 'done', valid, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      setVerdict({ state: 'error', msg: (e as Error).message });
    }
  };

  if (zk.status === 'failed') {
    return (
      <div className="card zk zk-fail">
        <div className="row-card"><XIcon size={20} weight="light" className="bad" /><div className="strong bad">{zk.error}</div></div>
        <p className="muted">The circuit only accepts inputs in which no token equals the leaked key. While the key is still in the repo, no valid proof can be produced.</p>
      </div>
    );
  }
  if (zk.status !== 'proved') {
    return (
      <div className="card zk"><div className="row-card"><FingerprintIcon size={20} weight="light" /><span className="muted">{zk.status === 'proving' ? 'Generating Groth16 proof…' : 'No proof yet.'}</span></div></div>
    );
  }

  const p = zk.publicSignals!;
  return (
    <div className="card zk">
      {!compact && (
        <div className="zk-io">
          <div>
            <div className="eyebrow">Hidden (private)</div>
            <div className="mono">{zk.tokenCount} repo token(s)</div>
            <div className="small muted">never leave the server</div>
          </div>
          <div>
            <div className="eyebrow">Public</div>
            <div className="mono small">commit {p.commitShaHex.slice(0, 10)}</div>
            <div className="mono small">hash(leaked key) {middle(p.leakedKeyHash, 6)}</div>
            <div className="mono small">commitment {middle(p.commitment, 6)}</div>
          </div>
          <div>
            <div className="eyebrow">Proof</div>
            <div className="mono">Groth16 · {zk.durationMs} ms</div>
            <div className="small muted">~800 bytes, anyone can check it</div>
          </div>
        </div>
      )}
      <div className="zk-actions">
        <button className="btn primary" onClick={verify} disabled={verdict.state === 'checking'}>
          {verdict.state === 'checking' ? 'Verifying…' : 'Verify in my browser'}
        </button>
        <a className="btn ghost" href="/api/zk/proof.json"><DownloadSimpleIcon size={16} weight="light" /> proof.json</a>
        {verdict.state === 'done' && (
          <span className={`verdict ${verdict.valid ? 'safe' : 'bad'}`}>
            {verdict.valid ? <CheckIcon size={18} /> : <XIcon size={18} />} {verdict.valid ? 'Valid' : 'Invalid'}
            <span className="muted small"> · checked locally in {verdict.ms} ms, the server was not involved</span>
          </span>
        )}
        {verdict.state === 'error' && <span className="bad small">{verdict.msg}</span>}
      </div>
    </div>
  );
}
