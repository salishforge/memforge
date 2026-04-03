# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# ─── Runtime stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Copy only production deps + compiled output
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY schema ./schema

# Run as non-root user
RUN addgroup -g 1001 memforge && adduser -D -u 1001 -G memforge memforge
USER memforge

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3333/health || exit 1

CMD ["node", "dist/server.js"]
