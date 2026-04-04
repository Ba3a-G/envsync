# `@envsync-cloud/deploy-cli`

CLI for self-hosted EnvSync deployment on Docker Swarm.

This package provisions and manages the current EnvSync self-hosted stack for a single-host Docker Swarm installation. It is intended for operators deploying EnvSync on Ubuntu or Debian rather than for local app development.

## Supported Target Environment

- Single-host Ubuntu or Debian machine
- Docker Swarm manager node
- Public DNS ready for the root domain and subdomains
- Root or sudo access on the target host

The current self-hosted direction is documented in the main self-hosting guide:
- https://github.com/EnvSync-Cloud/envsync/blob/main/SELFHOSTING.md

## Installation

Run without a global install:

```bash
npx @envsync-cloud/deploy-cli <command>
```

Install globally:

```bash
npm install -g @envsync-cloud/deploy-cli
envsync-deploy <command>
```

Optional Bun invocation:

```bash
bunx @envsync-cloud/deploy-cli <command>
```

## Commands

```text
envsync-deploy preinstall
envsync-deploy setup
envsync-deploy bootstrap [--dry-run] [--force]
envsync-deploy deploy [--dry-run]
envsync-deploy promote [blue|green] [--dry-run]
envsync-deploy rollback [--dry-run]
envsync-deploy health [--json]
envsync-deploy upgrade [version] [--dry-run]
envsync-deploy upgrade-deps [--dry-run]
envsync-deploy backup [--dry-run]
envsync-deploy restore <archive> [--dry-run]
```

## Quick Start

Prepare the host:

```bash
npx @envsync-cloud/deploy-cli preinstall
```

Write the desired self-hosted config:

```bash
npx @envsync-cloud/deploy-cli setup
```

`setup` requires an exact release version such as `0.6.2`. Channel names like `stable` and `latest` are not accepted for self-hosted installs.

The configured target release comes from `/etc/envsync/deploy.yaml`. `upgrade` now updates that pinned release for you:

```bash
bunx @envsync-cloud/deploy-cli@0.6.25 upgrade
```

Without an explicit `version` argument, `upgrade` targets the running deploy-cli package version. You can also pin a different target directly:

```bash
bunx @envsync-cloud/deploy-cli@0.6.25 upgrade 0.6.24
```

Bootstrap infra, migrations, RustFS, and OpenFGA:

```bash
npx @envsync-cloud/deploy-cli bootstrap
```

`bootstrap` is destructive. It removes the existing EnvSync stack, matching containers, network, and managed volumes before rebuilding, and requires typing `yes` to continue. Use `--force` to bypass the prompt in automation or other non-interactive environments.

During destructive bootstrap, stable generated secrets are preserved, but persisted OpenFGA store/model IDs are cleared before re-initialization so a fresh OpenFGA database cannot reuse stale IDs from a previous run.

Deploy the pending API and frontend services:

```bash
npx @envsync-cloud/deploy-cli deploy
```

The staged flow is:
- `setup` writes desired config
- `bootstrap` resets the existing EnvSync deployment, then starts base infra, runs OpenFGA and miniKMS migrations, starts runtime infra, initializes ClickStack sources and dashboards, and persists generated runtime env state
- `deploy` updates only the inactive API slot, waits for it to become healthy, then promotes traffic to it and keeps the previous slot ready for rollback

Manual slot operations:

```bash
npx @envsync-cloud/deploy-cli promote
npx @envsync-cloud/deploy-cli rollback
```

`promote` switches traffic to the requested or inactive API slot without rebuilding images. `rollback` switches traffic back to the previously active slot recorded in generated deploy state.

For normal production installs, `release.version` is the source of truth for the managed EnvSync release artifacts:
- `source.ref`
- API image
- Keycloak image tag
- web static image
- landing static image

`deploy` reconciles those managed versioned artifacts from `release.version` automatically. Explicit custom image overrides are still preserved for local or advanced self-hosted flows.

Self-hosted observability routing is:
- `https://obs.<root-domain>/` for ClickStack UI
- `https://obs.<root-domain>/api/...` for ClickStack API
- `https://obs.<root-domain>/v1/{traces,logs,metrics}` for browser OTLP

Both frontends receive `otelEndpoint = https://obs.<root-domain>` in the generated `runtime-config.js`.

Check service health:

```bash
npx @envsync-cloud/deploy-cli health --json
```

Create a backup archive:

```bash
npx @envsync-cloud/deploy-cli backup
```

Restore from an existing backup archive:

```bash
npx @envsync-cloud/deploy-cli restore /path/to/envsync-backup.tar.gz
```

Preview mutating commands without changing the host:

```bash
npx @envsync-cloud/deploy-cli bootstrap --dry-run
npx @envsync-cloud/deploy-cli bootstrap --force
npx @envsync-cloud/deploy-cli deploy --dry-run
```

## Local Smoke Testing

Use the repo-local smoke harness to test unpublished self-hosted deploy-cli changes without publishing to GitHub or npm:

```bash
bun run selfhost:smoke
```

The smoke harness:
- runs the local `packages/deploy-cli/src/index.ts` directly
- uses disposable roots under `.tmp/selfhost-smoke`
- sets `ENVSYNC_REPO_ROOT` to the current workspace so no repo clone/fetch/checkout happens
- uses high host ports instead of `80/443`

Advanced local test overrides supported by the deploy-cli:
- `ENVSYNC_HOST_ROOT`
- `ENVSYNC_ETC_ROOT`
- `ENVSYNC_TRAEFIK_STATE_ROOT`
- `ENVSYNC_REPO_ROOT`

## Links

- Repository: https://github.com/EnvSync-Cloud/envsync
- Issues: https://github.com/EnvSync-Cloud/envsync/issues
- Self-hosting guide: https://github.com/EnvSync-Cloud/envsync/blob/main/SELFHOSTING.md

## Versioning

This package releases from the shared monorepo tag flow. Published npm versions are tied to repo tags in the form `vX.Y.Z`.
