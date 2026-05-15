# Production image for the Daisy-DAG backend (API + worker).
#
# Multi-stage to keep the runtime layer small — the builder stage pulls
# all deps, the runtime stage copies just node_modules + the source we
# actually run. Final image is ~180MB on node:22-alpine vs ~600MB+ if
# we baked the build cache into one stage.
#
# Runs as the unprivileged `node` user. `tini` reaps zombie children
# from any subprocess the worker spawns.
#
# Build context = ./backend (set in docker-compose.yml). When the
# DOCKERFILE_DIR is ./backend, the `.` paths below resolve correctly.

# ---------- builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies. We don't run npm test here — that's CI's job.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the application source.
COPY src ./src
COPY migrations ./migrations

# ---------- runtime ----------
FROM node:22-alpine AS runtime

# tini is the smallest init that handles SIGTERM + reaps zombies. The
# worker forks the engine; without an init the container leaks.
RUN apk add --no-cache tini

WORKDIR /app

# Carry just what's needed at runtime. node_modules is already
# --omit=dev from the builder stage.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src          ./src
COPY --from=builder /app/migrations   ./migrations
COPY package.json ./

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Drop privileges. The `node` user is created by the official image.
USER node

ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]
