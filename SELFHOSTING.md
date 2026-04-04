# Self-Hosting EnvSync

This document describes the current self-hosted direction for EnvSync.

## Target Platform

Supported v1 target:
- single-host Docker Swarm
- Ubuntu/Debian manager node
- Traefik as the only public edge proxy
- GHCR for API and static release images
- Keycloak for authentication
- ClickStack / HyperDX for observability

Explicitly out of scope:
- Helm
- Kubernetes

## Public Host Map

Recommended hostnames:
- `<root-domain>`: landing page
- `app.<root-domain>`: dashboard
- `api.<root-domain>`: API
- `auth.<root-domain>`: Keycloak
- `obs.<root-domain>`: ClickStack / HyperDX
- `s3.<root-domain>`: S3-compatible API
- `console.s3.<root-domain>`: object storage console
- `mail.<root-domain>`: Mailpit, disabled by default in production

## Core Services

The intended self-hosted stack includes:
- Traefik
- EnvSync API
- Nginx for landing and dashboard static assets
- PostgreSQL
- Redis
- RustFS
- OpenFGA
- miniKMS
- Keycloak
- ClickStack
- OTEL agent

Only Traefik should publish host ports.

## Authentication

EnvSync now uses Keycloak instead of Zitadel.

Realm:
- `envsync`

Expected clients:
- `envsync-web`
- `envsync-api`
- `envsync-cli`

Theme:
- custom theme lives in [packages/envsync-keycloak-theme](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/packages/envsync-keycloak-theme)
- self-hosted deploys build the Keycloak image locally from that repo path instead of pulling a GHCR Keycloak image

Important note:
- existing Zitadel-based self-hosted installs should be treated as a breaking migration
- the current path is fresh Keycloak cutover, not automated user migration

## Observability

EnvSync now standardizes on ClickStack / HyperDX.

Current direction:
- OTLP from API, CLI, and browser
- one OTEL agent for local and self-hosted collection/routing
- ClickStack as the UI and backend for traces, logs, and metrics
- self-hosted browser OTLP posts to `https://obs.<root-domain>/v1/...`
- self-hosted ClickStack UI lives at `https://obs.<root-domain>/`
- self-hosted ClickStack API is reverse proxied at `https://obs.<root-domain>/api/...`

Local helper commands:

```bash
bun run clickstack:sync
bun run clickstack:bootstrap
```

## Deploy CLI

The self-hosted deploy package is:
- [packages/deploy-cli](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/packages/deploy-cli)

Published package name:
- `@envsync-cloud/deploy-cli`

Command surface:
- `preinstall`
- `setup`
- `bootstrap [--dry-run]`
- `deploy [--dry-run]`
- `promote [blue|green] [--dry-run]`
- `rollback [--dry-run]`
- `health`
- `upgrade [version] [--dry-run]`
- `upgrade-deps [--dry-run]`
- `backup [--dry-run]`
- `restore [--dry-run]`

Invocation style:

```bash
npx @envsync-cloud/deploy-cli <subcommand>
```

Optional Bun invocation:

```bash
bunx @envsync-cloud/deploy-cli <subcommand>
```

## Local vs Self-Hosted

Local development today is Docker Compose based.

Canonical local browser URLs:
- `http://app.lvh.me:8001`
- `http://api.lvh.me:4000`
- `http://auth.lvh.me:8080`

`lvh.me` resolves to `127.0.0.1`, so local auth works without editing `/etc/hosts`. `localhost` is not the supported browser login path for Keycloak local auth.

Self-hosted production direction is Docker Swarm based.

That means:
- local uses `docker-compose.yaml`
- self-hosted generation is handled by `packages/deploy-cli`
- local ClickStack setup is seeded by scripts
- self-hosted assets and stack files are generated during `bootstrap` / `deploy`
- local, E2E, and self-hosted all build Keycloak from repo source
- self-hosted installs use an exact release version, not `stable` or `latest`
- self-hosted Keycloak builds use a pinned repo checkout recorded in `/etc/envsync/deploy.yaml` as `source.ref = v<version>`
- generated runtime state is kept in `/etc/envsync/deploy.env`

## Current Reality

Implemented and usable now:
- local Keycloak bootstrap
- local ClickStack / HyperDX bootstrap
- local dashboards and sources seeding
- custom Keycloak theme package
- deploy CLI package scaffold and command surface

Still evolving:
- full production-grade dashboard parity with the old Grafana setup
- full-container E2E coverage for every runtime service
- final production backup/restore polish across all services

## Recommended Local Bootstrap

```bash
cp .env.example .env
bun install
docker compose up -d
bun run cli:init
bun run cli:create-dev-user --seed
bun run clickstack:sync
bun run dev
```

## Recommended Self-Hosted Flow

```bash
npx @envsync-cloud/deploy-cli preinstall
npx @envsync-cloud/deploy-cli setup
npx @envsync-cloud/deploy-cli bootstrap
npx @envsync-cloud/deploy-cli deploy
```

Preview mutating steps without changing the host:

```bash
npx @envsync-cloud/deploy-cli bootstrap --dry-run
npx @envsync-cloud/deploy-cli bootstrap --force
npx @envsync-cloud/deploy-cli deploy --dry-run
```

Stage ownership:
- `setup` writes desired operator config, including an exact release version such as `0.6.2`
- `bootstrap` first removes the existing EnvSync stack, matching containers, network, and managed volumes after a `yes` confirmation, or with `--force` in non-interactive environments, then starts base infra, runs OpenFGA and miniKMS migration jobs, starts runtime infra, initializes RustFS, initializes or validates OpenFGA, bootstraps ClickStack sources/dashboards for the self-hosted host, and persists generated env state
- `deploy` performs a blue/green API rollout by updating the inactive slot, waiting for health, then promoting traffic to that slot while leaving the previous slot available for rollback
- `promote` manually switches traffic to the requested or inactive API slot
- `rollback` switches traffic back to the previously active API slot recorded in generated deploy state

Bootstrap waits for Keycloak health on the management interface at `http://keycloak:9000/health/ready`.

Bootstrap cleanup is idempotent. If `docker stack rm` already removed the EnvSync overlay network or other managed resources, bootstrap should continue instead of failing and requiring a second run.

Destructive bootstrap resets generated OpenFGA IDs before re-initialization:
- generated secrets persist
- `OPENFGA_STORE_ID` does not persist
- `OPENFGA_MODEL_ID` does not persist
- `bootstrap.completed_at` is cleared until the new run succeeds

The configured target release always comes from `/etc/envsync/deploy.yaml`, but `upgrade` now updates that target for you. If no explicit version is passed, it uses the running deploy-cli package version.

Examples:

```bash
bunx @envsync-cloud/deploy-cli@0.6.25 upgrade
bunx @envsync-cloud/deploy-cli@0.6.25 upgrade 0.6.24
```

For normal production installs, the pinned `release.version` is the source of truth for:
- `source.ref`
- EnvSync API image
- Keycloak image tag
- web static image
- landing static image

`deploy` reconciles those managed versioned artifacts from `release.version` automatically. Explicit custom image overrides are still preserved for local smoke or advanced custom deployments.

Generated frontend runtime config uses:
- `otelEndpoint = https://obs.<root-domain>`

Traefik public host routing is:
- `https://<root-domain>` -> landing
- `https://app.<root-domain>` -> dashboard
- `https://api.<root-domain>` -> EnvSync API
- `https://auth.<root-domain>` -> Keycloak
- `https://obs.<root-domain>/` -> ClickStack UI
- `https://obs.<root-domain>/api/...` -> ClickStack API
- `https://obs.<root-domain>/v1/{traces,logs,metrics}` -> OTLP HTTP
- `https://s3.<root-domain>` -> RustFS S3 API
- `https://console.s3.<root-domain>` -> RustFS console

Release artifact requirements:
- `ghcr.io/envsync-cloud/envsync-api:<version>`
- `ghcr.io/envsync-cloud/envsync-web-static:<version>`
- `ghcr.io/envsync-cloud/envsync-landing-static:<version>`

## Local Smoke Testing

Use the repo-local self-host smoke harness before publishing deploy-cli changes:

```bash
bun run selfhost:smoke
```

This smoke flow:
- runs the local deploy-cli source directly
- uses disposable roots under `.tmp/selfhost-smoke`
- avoids touching `/etc/envsync` and `/opt/envsync`
- uses `ENVSYNC_REPO_ROOT` to test the current workspace without cloning or checking out tags
- publishes Traefik on high test ports instead of `80/443`

## Related Files

- [docker-compose.yaml](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/docker-compose.yaml)
- [docker-compose.prod.yaml](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/docker-compose.prod.yaml)
- [packages/deploy-cli/src/index.ts](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/packages/deploy-cli/src/index.ts)
- [scripts/sync-clickstack-local.ts](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/scripts/sync-clickstack-local.ts)
- [scripts/bootstrap-clickstack-local.ts](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/scripts/bootstrap-clickstack-local.ts)
- [scripts/bootstrap-clickstack-selfhost.mjs](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/scripts/bootstrap-clickstack-selfhost.mjs)
