// Mock of the two Google endpoints LeakGuard touches, using the *same* REST paths as production:
//   API Keys API  : https://apikeys.googleapis.com/v2/projects/{p}/locations/global/keys
//   Gemini API    : https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// Swapping GOOGLE_MODE=real points the orchestrator at the real hosts with no code change.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 7000);
const keys = new Map(); // uid -> { name, uid, displayName, keyString, createTime, deleteTime? }

const FORTUNES = [
  'Your next deploy will be green on the first try.',
  'A rotated key is a happy key.',
  'Beware of interns bearing .env files.',
  'The cloud remembers what git forgets.',
  'Zero knowledge, maximum confidence.',
  'Today you will close a ticket without opening two more.',
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function newKeyString() {
  const bytes = crypto.randomBytes(35);
  let s = 'AIza';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function geminiError(res) {
  // Same shape Google returns for a deleted/invalid key.
  send(res, 400, {
    error: {
      code: 400,
      message: 'API key not valid. Please pass a valid API key.',
      status: 'INVALID_ARGUMENT',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }],
    },
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  if (path === '/healthz') return send(res, 200, { ok: true, keys: keys.size });

  // ---- Gemini generateContent ----
  const gm = path.match(/^\/v1beta\/models\/([^/:]+):generateContent$/);
  if (gm && req.method === 'POST') {
    await readBody(req);
    const keyString = url.searchParams.get('key') || req.headers['x-goog-api-key'];
    const key = [...keys.values()].find((k) => k.keyString === keyString);
    if (!key || key.deleteTime) return geminiError(res);
    const caller = String(req.headers['user-agent'] || 'unknown');
    const text = caller.includes('attacker')
      ? `Sure! Here is the 10,000-word essay you asked for (billed to ${key.displayName}).`
      : FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    return send(res, 200, {
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
      modelVersion: gm[1],
    });
  }

  // ---- API Keys API v2 ----
  const auth = req.headers.authorization || '';
  if (path.startsWith('/v2/') && !auth.startsWith('Bearer ')) {
    return send(res, 401, { error: { code: 401, message: 'Request is missing required authentication credential.', status: 'UNAUTHENTICATED' } });
  }

  const list = path.match(/^\/v2\/projects\/([^/]+)\/locations\/global\/keys$/);
  if (list && req.method === 'POST') {
    const body = await readBody(req);
    const uid = crypto.randomUUID();
    const key = {
      name: `projects/${list[1]}/locations/global/keys/${uid}`,
      uid,
      displayName: body.displayName || 'leakguard-key',
      keyString: newKeyString(),
      createTime: new Date().toISOString(),
      restrictions: body.restrictions || {},
    };
    keys.set(uid, key);
    console.log(`[apikeys] created ${uid} (${key.displayName})`);
    const { keyString, ...resource } = key;
    return send(res, 200, { name: `operations/akmf.${uid}`, done: true, response: { '@type': 'type.googleapis.com/google.api.apikeys.v2.Key', ...resource } });
  }
  if (list && req.method === 'GET') {
    return send(res, 200, { keys: [...keys.values()].map(({ keyString, ...k }) => k) });
  }

  const one = path.match(/^\/v2\/projects\/([^/]+)\/locations\/global\/keys\/([^/]+?)(\/keyString)?$/);
  if (one) {
    const key = keys.get(one[2]);
    if (!key) return send(res, 404, { error: { code: 404, message: 'Key not found', status: 'NOT_FOUND' } });
    if (one[3] && req.method === 'GET') return send(res, 200, { keyString: key.keyString });
    if (req.method === 'GET') { const { keyString, ...k } = key; return send(res, 200, k); }
    if (req.method === 'DELETE') {
      key.deleteTime = new Date().toISOString();
      console.log(`[apikeys] deleted ${key.uid}`);
      const { keyString, ...resource } = key;
      return send(res, 200, { name: `operations/akmf.del.${key.uid}`, done: true, response: resource });
    }
  }

  send(res, 404, { error: { code: 404, message: `No route ${req.method} ${path}`, status: 'NOT_FOUND' } });
});

server.listen(PORT, () => console.log(`mock-google listening on :${PORT}`));
