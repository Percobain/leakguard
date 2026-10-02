import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { state, subscribe, log } from './state.js';
import { bootstrap, leak, reset, proveNow, attackerEvent } from './pipeline.js';
import { verifyProof } from './zk.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const action = (fn: () => Promise<unknown>) => async (_req: express.Request, res: express.Response) => {
  try {
    await fn();
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({ ok: false, error: (e as Error).message });
  }
};

app.get('/api/state', (_req, res) => res.json(state));
app.post('/api/leak', action(leak));
app.post('/api/reset', action(reset));
app.post('/api/zk/prove', action(proveNow));
app.post('/api/internal/attacker', (req, res) => {
  attackerEvent(req.body);
  res.json({ ok: true });
});
app.get('/api/zk/verification_key.json', (_req, res) => res.sendFile(path.join(config.zkBuildDir, 'verification_key.json')));
app.get('/api/zk/proof.json', (_req, res) => {
  if (!state.zk.proof) return res.status(404).json({ error: 'No proof yet' });
  res.setHeader('content-disposition', 'attachment; filename="leakguard-proof.json"');
  res.json({ proof: state.zk.proof, publicSignals: state.zk.rawPublicSignals, commit: state.zk.publicSignals?.commitShaHex });
});
app.post('/api/zk/verify', async (_req, res) => {
  if (!state.zk.proof) return res.status(404).json({ error: 'No proof yet' });
  res.json({ valid: await verifyProof(config.zkBuildDir, state.zk.proof, state.zk.rawPublicSignals!) });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'state', state })));
subscribe((s) => {
  const msg = JSON.stringify({ type: 'state', state: s });
  for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg);
});

server.listen(config.port, () => {
  console.log(`orchestrator on :${config.port}`);
  const start = () =>
    bootstrap().catch((e) => {
      log('leakguard', `Bootstrap failed: ${e.message} — retrying in 5s`, 'error');
      setTimeout(start, 5000);
    });
  start();
});
