// Copies the browser build of snarkjs into public/ so the dashboard can verify
// Groth16 proofs client-side ("don't trust our server, verify it yourself").
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'snarkjs', 'build', 'snarkjs.min.js');
const dest = join(root, 'public', 'snarkjs.min.js');

if (!existsSync(src)) {
  console.warn('[copy-snarkjs] snarkjs not installed, skipping');
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('[copy-snarkjs] public/snarkjs.min.js ready');
