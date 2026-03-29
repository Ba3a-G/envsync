FROM oven/bun:1.3.9 AS build

WORKDIR /app

COPY tsconfig.json ./
COPY packages/envsync-deploy-cli ./packages/envsync-deploy-cli

RUN bun run --cwd packages/envsync-deploy-cli build

FROM oven/bun:1.3.9

WORKDIR /app

COPY --from=build /app/packages/envsync-deploy-cli/package.json /app/packages/envsync-deploy-cli/package.json
COPY --from=build /app/packages/envsync-deploy-cli/README.md /app/packages/envsync-deploy-cli/README.md
COPY --from=build /app/packages/envsync-deploy-cli/scripts /app/packages/envsync-deploy-cli/scripts
COPY --from=build /app/packages/envsync-deploy-cli/dist /app/packages/envsync-deploy-cli/dist

ENTRYPOINT ["bun", "/app/packages/envsync-deploy-cli/dist/cli.js"]
