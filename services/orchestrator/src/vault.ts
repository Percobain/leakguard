import { config } from './config.js';
import { log, sleep } from './state.js';

async function v<T = any>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<T> {
  const r = await fetch(`${config.vaultAddr}/v1/${path}`, {
    method,
    headers: { 'X-Vault-Token': config.vaultToken, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok && !okStatuses.includes(r.status)) throw new Error(`Vault ${r.status} ${method} ${path}: ${await r.text()}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface GeminiSecret {
  api_key: string;
  key_id: string;
  created_at: number;
  reason: string;
}

export async function waitForVault() {
  for (;;) {
    try {
      const r = await fetch(`${config.vaultAddr}/v1/sys/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
}

/** AppRole + least-privilege policy so the demo app can only *read* its one secret. */
export async function bootstrapVault() {
  await waitForVault();
  const auths = await v<any>('GET', 'sys/auth');
  if (!auths['approle/']) await v('POST', 'sys/auth/approle', { type: 'approle' });
  await v('PUT', 'sys/policies/acl/gemini-read', {
    policy: `path "secret/data/${config.vaultSecretPath}" { capabilities = ["read"] }`,
  });
  await v('POST', 'auth/approle/role/demo-app', { token_policies: ['gemini-read'], token_ttl: '1h', secret_id_num_uses: 0 });
  await v('POST', 'auth/approle/role/demo-app/role-id', { role_id: 'demo-app' });
  // Idempotent: re-registering an existing custom secret-id fails, which is fine.
  await v('POST', 'auth/approle/role/demo-app/custom-secret-id', { secret_id: config.demoAppSecretId }, [400, 500]);
  log('vault', 'AppRole "demo-app" ready with read-only policy gemini-read', 'success');
}

export async function readCurrent(): Promise<{ version: number; data: GeminiSecret } | null> {
  const r = await v<any>('GET', `secret/data/${config.vaultSecretPath}`, undefined, [404]);
  if (!r?.data?.data) return null;
  return { version: r.data.metadata.version, data: r.data.data };
}

export async function readVersion(version: number): Promise<GeminiSecret | null> {
  const r = await v<any>('GET', `secret/data/${config.vaultSecretPath}?version=${version}`, undefined, [404]);
  return r?.data?.data ?? null;
}

export async function writeSecret(data: GeminiSecret): Promise<number> {
  const r = await v<any>('POST', `secret/data/${config.vaultSecretPath}`, { data });
  return r.data.version;
}
