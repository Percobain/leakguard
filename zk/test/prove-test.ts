import { proveClean, verifyProof, DirtyRepoError, shutdownZk, tokenToField } from '../../services/orchestrator/src/zk.ts';
import { fileURLToPath } from 'node:url';
const buildDir = fileURLToPath(new URL('../build', import.meta.url));
const key = 'AIza' + 'Sy' + 'X'.repeat(33);
const sha = 'a'.repeat(40);
const tokens = ['const_DATABASE_URL_placeholder', 'REMOVED_BY_LEAKGUARD_xxxxxx', 'another_long_identifier_name'];
const r = await proveClean({ tokens, leakedKey: key, commitSha: sha, buildDir });
console.log('clean proof ms', r.durationMs, 'tokens', r.tokenCount, 'signals', r.publicSignals);
console.log('leakedKeyHash matches signal[1]:', r.publicSignals[1] === tokenToField(key).toString(), 'sha signal[2]:', r.publicSignals[2] === BigInt('0x'+sha).toString());
console.log('verify:', await verifyProof(buildDir, r.proof, r.publicSignals));
const bad = [...r.publicSignals]; bad[1] = '123';
console.log('tampered verify:', await verifyProof(buildDir, r.proof, bad));
try { await proveClean({ tokens: [...tokens, key], leakedKey: key, commitSha: sha, buildDir }); console.log('DIRTY: unexpected success'); }
catch (e) { console.log('dirty ->', e instanceof DirtyRepoError, (e as Error).message); }
await shutdownZk();
