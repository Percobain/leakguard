import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import type { Commit } from './types.js';

const exec = promisify(execFile);
const repoDir = path.join(config.workDir, 'repo');
const remote = `https://x-access-token:${config.githubToken}@github.com/${config.targetRepo}.git`;
export const REDACTION = '***REMOVED-BY-LEAKGUARD***';

async function git(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  const { stdout } = await exec('git', args, {
    cwd: opts.cwd ?? repoDir,
    env: { ...process.env, ...opts.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

/** Fresh view of origin/main in the local working clone. */
export async function sync() {
  if (!existsSync(path.join(repoDir, '.git'))) {
    await mkdir(config.workDir, { recursive: true });
    await git(['clone', remote, repoDir], { cwd: config.workDir });
    await git(['config', 'user.name', 'LeakGuard Bot']);
    await git(['config', 'user.email', 'leakguard@users.noreply.github.com']);
  }
  await git(['remote', 'set-url', 'origin', remote]).catch(() => git(['remote', 'add', 'origin', remote]));
  await git(['fetch', '--prune', '--force', '--tags', 'origin']);
  await git(['checkout', '-B', 'main', 'origin/main']);
  await git(['reset', '--hard', 'origin/main']);
}

export async function listCommits(secrets: string[], limit = 12): Promise<Commit[]> {
  const out = await git(['log', `-n${limit}`, '--format=%H%x1f%s%x1f%an%x1f%at', 'main']);
  const commits: Commit[] = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [sha, message, author, at] = line.split('\x1f');
    let dirty = false;
    for (const s of secrets) {
      // `git grep` exits 0 when the secret is anywhere in that commit's tree.
      if (await git(['grep', '-q', '-F', '-e', s, sha]).then(() => true, () => false)) dirty = true;
    }
    commits.push({ sha, short: sha.slice(0, 7), message, author, date: Number(at) * 1000, dirty });
  }
  return commits;
}

export async function head() {
  return git(['rev-parse', 'HEAD']);
}

/** Play the intern: paste the production key into a committed config file and push. */
export async function commitLeak(key: string): Promise<string> {
  await sync();
  await writeFile(
    path.join(repoDir, 'config', 'production.env'),
    `# quick fix so it works on my machine, will remove later\nPORT=3000\nGEMINI_API_KEY=${key}\n`,
  );
  await git(['add', 'config/production.env']);
  const env = {
    GIT_AUTHOR_NAME: config.leakAuthorName,
    GIT_AUTHOR_EMAIL: config.leakAuthorEmail,
    GIT_COMMITTER_NAME: config.leakAuthorName,
    GIT_COMMITTER_EMAIL: config.leakAuthorEmail,
  };
  await git(['commit', '-m', 'add prod config so the demo works on my machine'], { env });
  await git(['push', 'origin', 'main']);
  return head();
}

/** Scrub every secret from every commit with git filter-repo, then force-push the rewritten history. */
export async function rewriteHistory(secrets: string[]) {
  await sync();
  const replacements = path.join(config.workDir, 'replacements.txt');
  await writeFile(replacements, secrets.map((s) => `${s}==>${REDACTION}`).join('\n') + '\n');
  await git(['filter-repo', '--force', '--replace-text', replacements]);
  await rm(replacements, { force: true });
  // filter-repo deliberately drops the "origin" remote; put it back and force-push.
  await git(['remote', 'add', 'origin', remote]).catch(() => undefined);
  await git(['push', '--force', 'origin', 'main']);
  await git(['fetch', '--prune', '--force', 'origin']);
}

/** Restore the demo repo to the clean "baseline" tag. */
export async function resetToBaseline() {
  await sync();
  const base = await git(['rev-parse', 'baseline^{commit}']);
  await git(['push', '--force', 'origin', `${base}:refs/heads/main`]);
  await sync();
}

/** Run gitleaks over the full local history. Returns number of findings. */
export async function scanLocal(): Promise<number> {
  const report = path.join(config.workDir, 'local-report.json');
  await exec('gitleaks', ['git', '--no-banner', '--report-format', 'json', '--report-path', report, '--exit-code', '0', repoDir], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const findings = JSON.parse((await readFile(report, 'utf8')) || '[]');
  return findings.length;
}

/** Every secret-shaped token (20+ chars of [A-Za-z0-9_-]) in every blob reachable from any ref. */
export async function candidateTokens(): Promise<string[]> {
  const objects = await git(['rev-list', '--objects', '--all', '--filter=object:type=blob']);
  const tokens = new Set<string>();
  for (const line of objects.split('\n')) {
    const [sha, file] = line.split(' ');
    if (!file) continue; // commits/trees have no path
    const content = await git(['cat-file', 'blob', sha]);
    for (const m of content.matchAll(/[A-Za-z0-9_-]{20,}/g)) tokens.add(m[0]);
  }
  return [...tokens];
}
