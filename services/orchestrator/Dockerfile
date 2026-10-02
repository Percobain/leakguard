# Build context: repository root (needs zk/build artifacts).
FROM node:20-bookworm-slim

ARG GITLEAKS_VERSION=8.21.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends git git-filter-repo ca-certificates curl \
 && curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    | tar -xz -C /usr/local/bin gitleaks \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/orchestrator/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/orchestrator/tsconfig.json ./
COPY services/orchestrator/src ./src
COPY zk/build ./zk/build

ENV ZK_BUILD_DIR=/app/zk/build WORK_DIR=/work
EXPOSE 4000
CMD ["npx", "tsx", "src/server.ts"]
