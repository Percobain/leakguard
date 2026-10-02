// Google API Keys API (v2) client. Same code path for the real service and the local mock;
// only the base URL and the access token differ.
import { GoogleAuth } from 'google-auth-library';
import { config } from './config.js';
import { sleep } from './state.js';

const auth = config.googleMode === 'real' ? new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }) : null;

async function token(): Promise<string> {
  if (!auth) return 'simulated-oauth-token';
  const t = await auth.getAccessToken();
  if (!t) throw new Error('Could not obtain Google access token');
  return t;
}

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${config.apiKeysBase}/v2/${path}`, {
    method,
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API Keys ${r.status} ${method} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

async function waitOperation(op: any): Promise<any> {
  while (!op.done) {
    await sleep(1000);
    op = await call('GET', op.name);
  }
  if (op.error) throw new Error(`Operation failed: ${op.error.message}`);
  return op.response;
}

export async function createKey(displayName: string): Promise<{ keyId: string; keyString: string }> {
  const op = await call('POST', `projects/${config.gcpProject}/locations/global/keys`, {
    displayName,
    restrictions: { apiTargets: [{ service: 'generativelanguage.googleapis.com' }] },
  });
  const key = await waitOperation(op);
  const { keyString } = await call<{ keyString: string }>('GET', `${key.name}/keyString`);
  return { keyId: key.name, keyString };
}

export async function deleteKey(keyId: string) {
  await waitOperation(await call('DELETE', keyId));
}

/** Does Gemini accept this key right now? */
export async function keyWorks(keyString: string): Promise<boolean> {
  const r = await fetch(`${config.geminiBase}/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(keyString)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'leakguard-probe' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
  }).catch(() => null);
  return !!r?.ok;
}
