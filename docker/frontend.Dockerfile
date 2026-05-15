# Production image for the Daisy-DAG frontend (Vue + Quasar SPA).
#
# Multi-stage: build the SPA with node 22, serve `dist/` from nginx.
# The nginx layer is ~25MB; the build stage isn't shipped.
#
# Build context = ./frontend (set in docker-compose.yml).

# ---------- builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Optional build arg — bake a different API URL into the SPA at build
# time. Leave unset to keep the SPA same-origin (the recommended shape:
# nginx proxies /api + /ws to the backend in the prod compose stack).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

# SPA-aware nginx config — lives inside ./frontend/ because Docker's
# COPY can only see files inside the build context. Falls back to
# index.html for client-side routes, proxies /api + /ws to the
# backend container.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
