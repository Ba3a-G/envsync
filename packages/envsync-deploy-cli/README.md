# EnvSync Deploy CLI

Single-node self-hosted deployment CLI for EnvSync.

Primary entrypoint:

```sh
bunx @envsync-cloud/deploy-cli <command>
```

Supported install surfaces:

```sh
bunx @envsync-cloud/deploy-cli --help
docker run --rm ghcr.io/envsync-cloud/deploy-cli:<version> --help
```

Supported commands:

- `preinstall`
- `setup`
- `deploy`
- `health`
- `upgrade`
- `upgrade-deps`
- `backup`
- `restore`

Local development:

```sh
bun run packages/envsync-deploy-cli/src/index.ts --help
```

Release model:

- published to npm as `@envsync-cloud/deploy-cli`
- published to GHCR as `ghcr.io/envsync-cloud/deploy-cli:<version>`
- both are released from the repo tag workflow on tags like `v0.4.1`
