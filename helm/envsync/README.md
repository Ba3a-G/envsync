# EnvSync Helm Chart

This chart deploys the core EnvSync control-plane services for self-hosted Kubernetes:

- `envsync-api`
- `envsync-init` bootstrap job
- `envsync-migrate` upgrade hook
- PostgreSQL
- Redis
- Zitadel
- OpenFGA
- MiniKMS
- RustFS

## Profiles

- `values-kind.yaml`: local validation only
- `values-selfhosted-single-node.yaml`: supported self-hosted single-node profile
- `values-selfhosted-ha.yaml`: reserved for future work
- `values-eks.yaml`: reserved for future work

## Local Kind Flow

From the repository root:

```sh
make kind-smoke-test
```

The Kind flow writes generated bootstrap secrets into `.tmp/values-kind.generated.yaml`
so the chart can come up without editing tracked files.

## Notes

- The chart is the primary self-hosting path in this repo.
- The Bun-based deploy CLI under `packages/envsync-deploy-cli/` is the primary lifecycle interface for self-hosted installs.
- The advanced operator-based `k8s/` path is intentionally deferred until the Helm path is stable.
- Ingress is disabled in `values-kind.yaml`; use `port-forward` for local validation.
- `make kind-smoke-test` is the official local deployment validation path for the chart.
