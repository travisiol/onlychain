# ONLYCHAIN — one container, one volume. The database and the uploads live
# under /data (ONLYCHAIN_DB_PATH, ONLYCHAIN_UPLOAD_DIR), so mount a volume
# there on any host: Railway, Fly, a VPS with docker compose.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV ONLYCHAIN_DB_PATH=/data/onlychain.db
ENV ONLYCHAIN_UPLOAD_DIR=/data/uploads
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
