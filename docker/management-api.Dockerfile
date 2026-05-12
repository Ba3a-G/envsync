FROM oven/bun:1.3.9-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY packages ./packages

RUN bun install
RUN bun run --filter envsync-management-api build

FROM oven/bun:1.3.9-alpine

WORKDIR /app

RUN addgroup -S envsync && adduser -S envsync -G envsync

COPY --from=build /app/packages/envsync-management-api/dist ./dist
COPY --from=build /app/packages/envsync-management-api/package.json ./package.json

RUN chown -R envsync:envsync /app

USER envsync

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

CMD ["bun", "run", "dist/entrypoint.js"]
