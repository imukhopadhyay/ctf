# ─── CyberQuest challenge runner ───
# Deploy on a DEDICATED host/VPC. It requires access to a container engine
# (Docker socket or a rootless/remote equivalent). Keep it off the app network.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm ci

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# docker CLI for the docker backend (talks to the daemon via DOCKER_HOST / mounted socket)
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src/server/runner ./src/server/runner
COPY runner ./runner
EXPOSE 4100
CMD ["npx", "tsx", "runner/src/server.ts"]
