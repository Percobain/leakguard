// Zero-knowledge "proof of clean repo" (Groth16 via snarkjs, circuit: zk/circuits/leakguard.circom).
// Public signals order (snarkjs): [commitment, leakedKeyHash, commitSha].
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
// @ts-ignore snarkjs ships without types
import * as snarkjs from 'snarkjs';

export const ZK_N = 64;

export class DirtyRepoError extends Error {
  constructor(msg = 'Leaked key still present in repo: proof impossible') {
    super(msg);
    this.name = 'DirtyRepoError';
  }
}

/** sha256(utf8 s) truncated to 248 bits so it always fits in the BN254 field. */
export function tokenToField(s: string): bigint {
  return BigInt('0x' + createHash('sha256').update(s, 'utf8').digest('hex')) >> 8n;
}

/** 160-bit git commit SHA as a field element. */
export function shaToField(hex40: string): bigint {
  if (!/^[0-9a-f]{40}$/i.test(hex40)) throw new Error(`Invalid commit SHA: ${hex40}`);
  return BigInt('0x' + hex40);
}

const artifacts = (buildDir: string) => ({
  wasm: path.join(buildDir, 'leakguard.wasm'),
  zkey: path.join(buildDir, 'leakguard_final.zkey'),
  vkey: path.join(buildDir, 'verification_key.json'),
});

export async function proveClean(opts: {
  tokens: string[];
  leakedKey: string;
  commitSha: string;
  buildDir: string;
}): Promise<{ proof: any; publicSignals: string[]; durationMs: number; tokenCount: number }> {
  const unique = [...new Set(opts.tokens)];
  if (unique.length > ZK_N) {
    throw new Error(`Too many candidate tokens (${unique.length} > ${ZK_N}) for the circuit`);
  }
  const leakedKeyHash = tokenToField(opts.leakedKey);
  const fields = unique.map(tokenToField);
  if (fields.some((f) => f === leakedKeyHash)) throw new DirtyRepoError();

  const input = {
    tokens: [...fields, ...Array(ZK_N - fields.length).fill(0n)].map(String),
    leakedKeyHash: leakedKeyHash.toString(),
    commitSha: shaToField(opts.commitSha).toString(),
  };
  const { wasm, zkey } = artifacts(opts.buildDir);
  const started = Date.now();
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
    return { proof, publicSignals, durationMs: Date.now() - started, tokenCount: unique.length };
  } catch (err: any) {
    // Witness generation fails on the `eq.out === 0` assertion if a token matches.
    if (/Assert Failed|constraint/i.test(String(err?.message ?? err))) throw new DirtyRepoError();
    throw err;
  }
}

export async function verifyProof(buildDir: string, proof: any, publicSignals: string[]): Promise<boolean> {
  const vkey = JSON.parse(await readFile(artifacts(buildDir).vkey, 'utf8'));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

/** Release snarkjs' worker threads so short-lived scripts can exit. */
export async function shutdownZk(): Promise<void> {
  await (globalThis as any).curve_bn128?.terminate?.();
}
