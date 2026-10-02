FROM node:20-alpine
WORKDIR /app
COPY server.js package.json ./
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=2s --retries=20 CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
