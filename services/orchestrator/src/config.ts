const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${name}`);
  return v;
};

export const config = {
  port: Number(env('PORT', '4000')),
  githubToken: env('GITHUB_TOKEN'),
  targetRepo: env('TARGET_REPO'), // owner/name
  workDir: env('WORK_DIR', '/work'),
  zkBuildDir: env('ZK_BUILD_DIR', '/app/zk/build'),

  vaultAddr: env('VAULT_ADDR', 'http://vault:8200'),
  vaultToken: env('VAULT_TOKEN', 'leakguard-root'),
  vaultSecretPath: 'leakguard/gemini', // KV v2 under mount "secret"
  demoAppSecretId: env('DEMO_APP_SECRET_ID', 'demo-app-secret-id'),

  googleMode: env('GOOGLE_MODE', 'simulated') as 'simulated' | 'real',
  gcpProject: env('GCP_PROJECT', 'leakguard-demo'),
  apiKeysBase: env('APIKEYS_BASE', 'http://mock-google:7000'),
  geminiBase: env('GEMINI_BASE', 'http://mock-google:7000'),

  demoAppContainer: env('DEMO_APP_CONTAINER', 'leakguard-demo-app'),
  demoAppUrl: env('DEMO_APP_URL', 'http://demo-app:3000'),
  attackerUrl: env('ATTACKER_URL', 'http://attacker:5000'),

  // Minimum time each chapter stays on screen so an audience can follow (0 = full speed).
  demoPaceMs: Number(env('DEMO_PACE_MS', '3000')),

  leakAuthorName: 'Rahul (intern)',
  leakAuthorEmail: 'rahul.intern@fortuneteller.dev',
};

if (config.googleMode === 'real') {
  config.apiKeysBase = 'https://apikeys.googleapis.com';
  config.geminiBase = 'https://generativelanguage.googleapis.com';
}
