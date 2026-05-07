# EnvSync OSS Deploy

Public OSS deploy package.

Current responsibilities:

- validate OSS deploy configs against edition rules
- render an OSS topology plan
- omit landing and management API artifacts
- keep observability opt-in

Commands:

- `envsync-deploy validate [deploy.yaml]`
- `envsync-deploy plan [deploy.yaml]`
