// One-time setup (run on the host): creates the private demo target repo on GitHub,
// pushes the template (incl. the gitleaks workflow) with a `baseline` tag, and writes .env.
//   node scripts/setup.mjs [--force]   (--force re-pushes the template over an existing repo)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString().trim();
const force = process.argv.includes('--force');

const owner = sh('gh api user -q .login');
const token = sh('gh auth token');
const repoName = process.env.TARGET_REPO_NAME || 'leakguard-demo-target';
const target = `${owner}/${repoName}`;
console.log(`GitHub user: ${owner}\nDemo target repo: ${target}`);

let exists = true;
try { sh(`gh repo view ${target} --json name`); } catch { exists = false; }
if (!exists) {
  sh(`gh repo create ${target} --private --description "LeakGuard demo target: a tiny Gemini app that gets its API key leaked on purpose"`);
  console.log('Created private repo');
}

let empty = true;
try { sh(`gh api repos/${target}/commits?per_page=1`); empty = false; } catch { /* empty repo -> 409 */ }

if (empty || force) {
  const dir = mkdtempSync(path.join(tmpdir(), 'leakguard-target-'));
  cpSync(path.join(root, 'target-template'), dir, { recursive: true });
  const git = (c) => sh(`git ${c}`, { cwd: dir });
  git('init -b main');
  git('add -A');
  git('commit -m "Initial commit: Fortune Teller service with LeakGuard secret scanning"');
  git('tag baseline');
  // Push over SSH: workflow files need the `workflow` scope over HTTPS, SSH keys are not scope-limited.
  git(`remote add origin git@github.com:${target}.git`);
  git('push --force origin main');
  git('push --force origin baseline');
  rmSync(dir, { recursive: true, force: true });
  console.log('Pushed template + baseline tag');
} else {
  console.log('Repo already has commits (use --force to re-push the template)');
}

const envPath = path.join(root, '.env');
const prev = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const keep = (k, d) => prev.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? d;
writeFileSync(
  envPath,
  [
    `GITHUB_TOKEN=${token}`,
    `TARGET_REPO=${target}`,
    `VAULT_TOKEN=${keep('VAULT_TOKEN', 'leakguard-root')}`,
    `DEMO_APP_SECRET_ID=${keep('DEMO_APP_SECRET_ID', crypto.randomUUID())}`,
    `GOOGLE_MODE=${keep('GOOGLE_MODE', 'simulated')}`,
    `GCP_PROJECT=${keep('GCP_PROJECT', 'leakguard-demo')}`,
    '',
  ].join('\n'),
);
console.log('Wrote .env\nNext: docker compose up --build   then open http://localhost:8080');
