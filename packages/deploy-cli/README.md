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
envsync-deploy bootstrap
envsync-deploy deploy
envsync-deploy health [--json]
envsync-deploy upgrade
envsync-deploy upgrade-deps
envsync-deploy backup
envsync-deploy restore <archive>
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

Bootstrap infra, migrations, RustFS, and OpenFGA:

```bash
npx @envsync-cloud/deploy-cli bootstrap
```

Deploy the pending API and frontend services:

```bash
npx @envsync-cloud/deploy-cli deploy
```

The staged flow is:
- `setup` writes desired config
- `bootstrap` starts infra and persists generated runtime env state
- `deploy` starts the pending API and frontend services

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

## Links

- Repository: https://github.com/EnvSync-Cloud/envsync
- Issues: https://github.com/EnvSync-Cloud/envsync/issues
- Self-hosting guide: https://github.com/EnvSync-Cloud/envsync/blob/main/SELFHOSTING.md

## Versioning

This package releases from the shared monorepo tag flow. Published npm versions are tied to repo tags in the form `vX.Y.Z`.
