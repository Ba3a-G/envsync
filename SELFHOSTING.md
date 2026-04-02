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

Planned command surface:
- `preinstall`
- `setup`
- `deploy`
- `health`
- `upgrade`
- `upgrade-deps`
- `backup`
- `restore`

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
- self-hosted assets and stack files are generated during `setup` / `deploy`
- local, E2E, and self-hosted all build Keycloak from repo source

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

## Related Files

- [docker-compose.yaml](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/docker-compose.yaml)
- [docker-compose.prod.yaml](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/docker-compose.prod.yaml)
- [packages/deploy-cli/src/index.ts](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/packages/deploy-cli/src/index.ts)
- [scripts/sync-clickstack-local.ts](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/scripts/sync-clickstack-local.ts)
- [scripts/bootstrap-clickstack-local.ts](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/scripts/bootstrap-clickstack-local.ts)
