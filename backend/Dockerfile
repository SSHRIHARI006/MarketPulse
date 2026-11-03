FROM node:22-alpine

WORKDIR /app

# Install only production dependencies for a small, reproducible image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 4000

# The server waits for PostgreSQL readiness before running schema/seed and the feed.
CMD ["node", "src/server.js"]
