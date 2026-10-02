# LeakGuard ZK proof — "this private repo no longer contains the leaked key"

Groth16 (snarkjs) over `circuits/leakguard.circom`, N = 64 leaves, ~15.4k constraints (`--O2`).

## What the prover does
1. Extract every *candidate secret token* (long `[A-Za-z0-9_-]{20,}` strings) from the repo snapshot.
2. Map each token to a field element: `sha256(token) >> 8` (248 bits). Pad to 64 leaves with `0`.
3. Prove, without revealing any token:
   - **Non-inclusion:** no leaf equals `leakedKeyHash` (`IsEqual(...).out === 0` for all 64 leaves).
   - **Commitment:** `commitment = Poseidon(PoseidonMerkleRoot(leaves), commitSha)`.

## Public signals (snarkjs order)
| index | signal | meaning |
|---|---|---|
| 0 | `commitment` | Merkle root of the hidden tokens, bound to the commit |
| 1 | `leakedKeyHash` | hash of the revoked key (safe to publish — the key is dead) |
| 2 | `commitSha` | git HEAD (sha1 as a field element) the proof refers to |

Anyone can check with `npx snarkjs groth16 verify build/verification_key.json public.json proof.json`.

## Honest limitation
The proof shows the leaked key is **not among the committed candidate tokens of the committed snapshot**.
It does not by itself prove that the snapshot *is* the full repo: that binding relies on the published
commit SHA and on the repo owner (or an auditor with access) re-running the same token extraction.
It also cannot un-leak a key someone already copied — which is why LeakGuard rotates first.

## Rebuild
```
docker run --rm -v "$PWD":/zk -w /zk node:20-bookworm bash build.sh
```
Uses circom v2.2.2 and the PSE perpetual Powers of Tau (`ppot_0080_15.ptau`, 2^15) plus one random phase-2 contribution.
Outputs `build/leakguard.wasm`, `build/leakguard_final.zkey`, `build/verification_key.json`.

Test: `npx tsx test/prove-test.ts` (needs snarkjs + tsx installed, e.g. in services/orchestrator).
