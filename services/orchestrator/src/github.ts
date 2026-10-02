import AdmZip from 'adm-zip';
import { config } from './config.js';
import type { ActionsRun, Finding } from './types.js';
import { mask } from './state.js';

const API = 'https://api.github.com';
const headers = {
  authorization: `Bearer ${config.githubToken}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'leakguard-orchestrator',
};

export async function gh<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers as any) } });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${init.method || 'GET'} ${path}: ${(await r.text()).slice(0, 200)}`);
  return (r.status === 204 ? undefined : r.json()) as T;
}

export async function listRuns(): Promise<ActionsRun[]> {
  const body = await gh<any>(`/repos/${config.targetRepo}/actions/runs?per_page=8`);
  return body.workflow_runs.map((r: any) => ({
    id: r.id,
    runNumber: r.run_number,
    name: r.display_title || r.name,
    status: r.status,
    conclusion: r.conclusion,
    url: r.html_url,
    headSha: r.head_sha,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
  }));
}

/** Download the gitleaks JSON report uploaded by the workflow run. Returns raw findings incl. the secret. */
export async function downloadFindings(runId: number): Promise<{ findings: Finding[]; secrets: string[] }> {
  const arts = await gh<any>(`/repos/${config.targetRepo}/actions/runs/${runId}/artifacts`);
  const art = arts.artifacts.find((a: any) => a.name === 'gitleaks-report');
  if (!art) return { findings: [], secrets: [] };
  // GitHub answers with a 302 to a signed blob URL; fetch follows it and drops our auth header cross-origin.
  const r = await fetch(art.archive_download_url, { headers });
  if (!r.ok) throw new Error(`artifact download ${r.status}`);
  const zip = new AdmZip(Buffer.from(await r.arrayBuffer()));
  const entry = zip.getEntries().find((e) => e.entryName.endsWith('.json'));
  const raw: any[] = entry ? JSON.parse(entry.getData().toString('utf8') || '[]') : [];
  return {
    secrets: raw.map((f) => f.Secret),
    findings: raw.map((f) => ({
      ruleId: f.RuleID,
      file: f.File,
      line: f.StartLine,
      commit: f.Commit,
      author: f.Author,
      secretMasked: mask(f.Secret),
      fingerprint: f.Fingerprint,
    })),
  };
}

export async function headSha(): Promise<string> {
  const ref = await gh<any>(`/repos/${config.targetRepo}/git/ref/heads/main`);
  return ref.object.sha;
}
