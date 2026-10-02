FROM node:20-alpine
WORKDIR /app
COPY server.js package.json ./
EXPOSE 7000
HEALTHCHECK --interval=5s --timeout=2s --retries=10 CMD wget -qO- http://localhost:7000/healthz || exit 1
CMD ["node", "server.js"]
