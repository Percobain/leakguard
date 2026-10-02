# 🛡️ LeakGuard

**Leaked-secret incident response on autopilot.** When a developer pushes an API key to GitHub, deleting
it is useless: bots scrape new commits within seconds and the key stays in git history. LeakGuard
detects the leak, **rotates** the key, **redeploys** production on the new key, **revokes** the leaked one,
**scrubs git history**, **re-verifies** and finally produces a **zero-knowledge proof** that the private
repo is clean, all while a live dashboard shows each step as it happens.

| Stage | Tool | What happens |
|---|---|---|
| Detect | GitHub Actions + **gitleaks** | Every push scans the full history; the JSON report is uploaded as an artifact |
| Rotate | **Google API Keys API** + **HashiCorp Vault** | A new Gemini key is minted and written as a new KV v2 version |
| Redeploy | **Docker** | The app container restarts and fetches the key from Vault via **AppRole** (read-only policy) |
| Revoke | Google API Keys API | The leaked key is deleted. Revocation runs *after* the redeploy, so there is zero downtime |
| Clean | **git filter-repo** | The key is replaced in every commit with `***REMOVED-BY-LEAKGUARD***`, then force-pushed |
| Verify | gitleaks (local) + GitHub Actions | The full rewritten history must return 0 findings |
| Prove | **Circom + snarkjs** (Groth16) | Proves the revoked key is not in the repo without revealing the repo; verifiable in the browser |

## Architecture

```
            push                       poll runs + download gitleaks-report artifact
 developer ───────▶ GitHub (private demo repo) ◀──────────────────────────────┐
                        │  Actions: gitleaks                                   │
                        ▼                                                      │
 attacker bot ── scrapes commits, abuses key ──▶ Gemini API      ┌─────────────┴────────────┐
                                                  ▲   ▲          │ orchestrator (Node + TS) │──WebSocket──▶ dashboard (React)
                          demo-app (Docker) ──────┘   │          │ git · gitleaks · snarkjs │
                               ▲  AppRole             │          └───┬──────────┬───────────┘
                               │                      │  API Keys    │ KV v2     │ docker.sock
                         HashiCorp Vault ◀────────────┼──────────────┘           │
                                                      └── mock-google / real Google ◀┘
```

Everything runs from one `docker compose up`: `vault`, `mock-google`, `demo-app`, `orchestrator`, `attacker`, `dashboard`.

## Run it

Prerequisites: Docker Desktop, Node 18+, GitHub CLI logged in (`gh auth login`), and an SSH key on GitHub.

```bash
npm run setup               # creates <you>/leakguard-demo-target (private), pushes the template + workflow, writes .env
docker compose up --build -d
open http://localhost:8080  # LeakGuard mission control
```

Other ports: Fortune-Teller app `:3000`, Vault UI `:8200` (token `leakguard-root`), orchestrator API `:4000`.

`DEMO_PACE_MS` (default `3000`) holds each finished chapter on screen so an audience can follow along.
The dashboard reports how much of the total time was pacing. Set it to `0` for full speed (about 35 s end to end).

## The dashboard

The UI reads like a story. The left rail lists the eight chapters in order (Leak, Detect, Rotate, Redeploy,
Revoke, Clean history, Verify, Prove). The stage on the right always shows the chapter happening *now*, with
one plain-English sentence and one visual. Underneath, three vital signs stay visible the whole time: the attacker,
the production app and the repository. The technical log is tucked into a drawer at the bottom.
Click any finished chapter to replay it, then "follow live" to return.

## Demo script (about 60 s)

1. **Leak a key**: "Rahul (intern)" commits `config/production.env` containing the production Gemini key. The exposure clock starts.
2. Within a few seconds the **attacker bot** harvests the key and starts getting `200 OK` from Gemini.
3. The GitHub Actions run turns red, and LeakGuard picks it up.
4. Vault goes v1 → v2, the container restarts on v2, and the leaked key is deleted. The attacker now gets `400 API_KEY_INVALID`.
5. History is rewritten (the *before/after* SHAs are shown), and CI re-runs green.
6. A Groth16 proof is generated. Click **Verify in my browser** to check it without trusting the server.
7. **Try proving clean** while the key is still in the repo: proof generation fails, because the circuit cannot prove a false claim.
8. **Reset demo** restores the repo to its `baseline` tag for the next run.

## Google: simulated vs real

By default `GOOGLE_MODE=simulated`. `mock-google` implements the same REST paths as
`apikeys.googleapis.com/v2` and `generativelanguage.googleapis.com/v1beta`, so the orchestrator code
path is identical. To rotate **real AI Studio / Gemini keys**:

1. In the GCP project behind your AI Studio keys, enable the *API Keys API* and create a service account with the **API Keys Admin** role. Save its JSON key as `secrets/gcp-sa.json`.
2. In `.env`, set `GOOGLE_MODE=real`, `GCP_PROJECT=<project-id>` and `GEMINI_BASE=https://generativelanguage.googleapis.com`.
3. `docker compose up -d --build`. Note that deleting a real key can take a minute or two to propagate at Google.

## The zero-knowledge proof

See [`zk/README.md`](zk/README.md). In short:
- **Private input:** every secret-shaped token (20+ chars) in every blob reachable from any ref, up to 64 tokens.
- **Public inputs:** `hash(leaked key)`, `commitSha`. **Output:** a Poseidon Merkle commitment bound to the commit.
- **Constraint:** no token equals the leaked key.

Limitation: the proof covers the snapshot that was committed to. Anyone with read access can re-derive
the commitment at the published commit SHA. GitHub may still serve orphaned commits by SHA until they are garbage-collected,
which is why **rotation, not deletion, is the real fix**.

## Repo layout

```
services/orchestrator   Node 20 + TypeScript: pipeline, GitHub/Vault/Google/Docker clients, ZK prover
services/mock-google    API Keys API v2 + Gemini generateContent look-alike
services/demo-app       "Gemini Fortune Teller": production app, reads its key from Vault via AppRole
services/attacker       scraper bot that harvests keys from new commits and abuses them
dashboard               React + Vite mission-control UI (nginx in Docker)
zk                      Circom circuit, build script, Groth16 artifacts
target-template         content + gitleaks workflow of the demo target repo
scripts/setup.mjs       one-time GitHub + .env bootstrap
```
