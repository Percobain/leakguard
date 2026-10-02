# Fortune Teller (LeakGuard demo target)

A tiny service that asks Gemini for a DevOps fortune. This private repository is the
"victim" that [LeakGuard](https://github.com/Percobain/leakguard) watches: every push is scanned
by gitleaks in GitHub Actions, and any leaked Google API key is rotated, redeployed,
scrubbed from history and proven clean with a zero-knowledge proof.

The production key lives in HashiCorp Vault. It should never be committed here.
