# EnvSync Deploy Core

Shared deployment primitives for edition-aware packaging.

This package is the extraction target for logic currently living in
`packages/deploy-cli` so both:

- `@envsync-cloud/deploy` for OSS
- `@envsync-cloud/deploy-cli` for Enterprise

can share release rendering, topology defaults, and runtime-config generation.

Current exports:

- config file loading for YAML or JSON
- edition-aware topology validation
- runtime env generation
- frontend artifact planning for OSS vs Enterprise
- release artifact planning for npm, GitHub Packages, and container images
