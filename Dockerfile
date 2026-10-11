# ─── CyberQuest web + worker image (multi-stage) ───
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 cyberquest
# Standalone server output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=cyberquest:nodejs /app/.next/standalone ./
COPY --from=builder --chown=cyberquest:nodejs /app/.next/static ./.next/static
# Prisma engine + schema + migrations for `migrate deploy`
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma
USER cyberquest
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ─── Worker image ───
FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY worker ./worker
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 cyberquest && chown -R cyberquest:nodejs /app
USER cyberquest
CMD ["npx", "tsx", "--conditions=react-server", "worker/src/worker.ts"]
