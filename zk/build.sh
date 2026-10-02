#!/usr/bin/env bash
# Reproducible LeakGuard circuit build. Run inside a node:20 container from the zk/ folder:
#   docker run --rm -v "$PWD":/zk -w /zk node:20-bookworm bash build.sh
set -euo pipefail
CIRCOM_VERSION=v2.2.2
PTAU=ppot_0080_${PTAU_POWER:-15}.ptau

# Powers of Tau: PSE perpetual ceremony (Hermez files are no longer publicly downloadable).
[ -x /usr/local/bin/circom ] || { curl -fsSL -o /usr/local/bin/circom "https://github.com/iden3/circom/releases/download/${CIRCOM_VERSION}/circom-linux-amd64"; chmod +x /usr/local/bin/circom; }
[ -d node_modules/circomlib ] || npm install --no-audit --no-fund --no-save circomlib@2.0.5 snarkjs@0.7.5
mkdir -p tmp build
[ -f "tmp/$PTAU" ] || curl -fsSL -o "tmp/$PTAU" "https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/$PTAU"

circom circuits/leakguard.circom --O2 --r1cs --wasm -o tmp
npx snarkjs r1cs info tmp/leakguard.r1cs
npx snarkjs groth16 setup tmp/leakguard.r1cs "tmp/$PTAU" tmp/leakguard_0000.zkey
npx snarkjs zkey contribute tmp/leakguard_0000.zkey build/leakguard_final.zkey \
  --name="LeakGuard contribution" -e="$(head -c 64 /dev/urandom | base64)"
npx snarkjs zkey export verificationkey build/leakguard_final.zkey build/verification_key.json
cp tmp/leakguard_js/leakguard.wasm build/leakguard.wasm
ls -la build
