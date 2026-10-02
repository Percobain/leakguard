pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// LeakGuard "proof of clean repo".
// Private: N candidate-token hashes extracted from the repo snapshot (padding = 0).
// Public:  leakedKeyHash (hash of the revoked key), commitSha (git HEAD the proof is bound to).
// Output:  commitment = Poseidon(MerkleRoot(tokens), commitSha).
// Proving is impossible if any token equals leakedKeyHash.
template LeakGuard(N) {
    signal input tokens[N];
    signal input leakedKeyHash;
    signal input commitSha;
    signal output commitment;

    // 1. Non-inclusion: every token must differ from the leaked key hash.
    component eq[N];
    for (var i = 0; i < N; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== tokens[i];
        eq[i].in[1] <== leakedKeyHash;
        eq[i].out === 0;
    }

    // 2. Binary Poseidon Merkle tree over the N leaves (N is a power of two).
    component h[N - 1];
    var level[2 * N - 1];
    for (var i = 0; i < N; i++) {
        level[i] = tokens[i];
    }
    signal nodes[N - 1];
    var next = N;
    var cur = 0;
    for (var i = 0; i < N - 1; i++) {
        h[i] = Poseidon(2);
        h[i].inputs[0] <== level[cur];
        h[i].inputs[1] <== level[cur + 1];
        nodes[i] <== h[i].out;
        level[next] = nodes[i];
        next++;
        cur += 2;
    }

    // 3. Bind the root to the git commit.
    component fin = Poseidon(2);
    fin.inputs[0] <== nodes[N - 2];
    fin.inputs[1] <== commitSha;
    commitment <== fin.out;
}

component main { public [leakedKeyHash, commitSha] } = LeakGuard(64);
