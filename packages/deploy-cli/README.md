# `@envsync-cloud/deploy-cli`

Deploy EnvSync self-hosted on a single Docker Swarm host. This CLI is for operators, not local app development.

## 🚀 Quick Start

Prepare the host:

```bash
npx @envsync-cloud/deploy-cli preinstall
```

Write `/etc/envsync/deploy.yaml`:

```bash
npx @envsync-cloud/deploy-cli setup
```

Bootstrap the managed infra:

```bash
npx @envsync-cloud/deploy-cli bootstrap
```

Deploy the pinned release:

```bash
npx @envsync-cloud/deploy-cli deploy
```

Running `envsync-deploy` with no subcommand shows the current operator status and the recommended next command.

## 🧭 What This CLI Does

- writes and normalizes the self-host deploy config
- renders the Swarm stack, Traefik, Keycloak, and runtime artifacts
- bootstraps generated secrets and self-host observability state
- deploys the inactive API slot first, then promotes traffic
- keeps the previous API slot available for rollback
- creates and restores full self-host backup archives

## 📦 Commands

- `preinstall` prepares Docker, Swarm, and required host packages.
- `setup` writes the desired self-host config.
- `bootstrap` destructively rebuilds managed infra and bootstrap state.
- `deploy` deploys the configured release.
- `promote [blue|green]` switches API traffic to a slot without rebuilding.
- `rollback` switches traffic back to the previously active API slot.
- `health --json` prints health JSON; plain `health` prints the operator summary view.
- `upgrade [version]` pins a release target and deploys it.
- `upgrade-deps` refreshes dependency image pins and redeploys.
- `backup` creates a managed self-host backup archive.
- `restore <archive>` restores a backup archive into the managed roots.

## 🔄 Upgrade Flow

`upgrade` now updates the pinned release target automatically. Without a version argument it uses the running deploy-cli package version.

```bash
bunx @envsync-cloud/deploy-cli@0.6.26 upgrade
bunx @envsync-cloud/deploy-cli@0.6.26 upgrade 0.6.25
```

Blue/green keeps the previous API slot around for rollback after promotion.

## 🛟 Rollback / Backup

Create a backup before upgrades:

```bash
npx @envsync-cloud/deploy-cli backup
```

Restore from an archive:

```bash
npx @envsync-cloud/deploy-cli restore /path/to/envsync-backup.tar.gz
```

Restore and start services immediately:

```bash
npx @envsync-cloud/deploy-cli restore /path/to/envsync-backup.tar.gz --deploy
```

Manual traffic control:

```bash
npx @envsync-cloud/deploy-cli promote
npx @envsync-cloud/deploy-cli rollback
```

## 🧪 Local Smoke

Validate unpublished deploy-cli changes from the monorepo:

```bash
bun run selfhost:smoke
```

## Important Notes

- Self-hosted releases use exact semver values, not `stable` or `latest`.
- `bootstrap` is destructive.
- `upgrade` and `deploy` reconcile managed versioned artifacts from `release.version`.
- Custom image overrides are still preserved for advanced self-host setups.
- The full deployment guide lives in [SELFHOSTING.md](/Users/bravo68web/Projects/OSS/EnvSync/monorepo/SELFHOSTING.md).
