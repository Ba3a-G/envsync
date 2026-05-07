# `@envsync-cloud/envsync-ts-sdk`

TypeScript SDK for the EnvSync API.

This package provides the generated fetch-based client, models, and service types for interacting with EnvSync from browser or server-side TypeScript applications.

## Install

```bash
npm install @envsync-cloud/envsync-ts-sdk
```

```bash
bun add @envsync-cloud/envsync-ts-sdk
```

```bash
pnpm add @envsync-cloud/envsync-ts-sdk
```

## Basic Usage

```ts
import { EnvSyncAPISDK } from "@envsync-cloud/envsync-ts-sdk";

const sdk = new EnvSyncAPISDK({
	BASE: "https://api.envsync.cloud",
	TOKEN: process.env.ENVSYNC_TOKEN,
});

const apps = await sdk.applications.getApps();

console.log(apps);
```

## Multi-Org Bearer Token Usage

If one identity belongs to multiple organizations, bearer-token clients can
select the org for a single request by sending `X-EnvSync-Org-Id`.

```ts
import { EnvSyncAPISDK } from "@envsync-cloud/envsync-ts-sdk";

const sdk = new EnvSyncAPISDK({
	BASE: "https://api.envsync.cloud",
	TOKEN: process.env.ENVSYNC_TOKEN,
	HEADERS: async () => ({
		"X-EnvSync-Org-Id": process.env.ENVSYNC_ORG_ID ?? "",
	}),
});

const me = await sdk.authentication.whoami();

console.log(me.org.id);
```

Notes:

- `X-EnvSync-Org-Id` is honored only for bearer-token requests.
- Cookie-session clients should continue using `POST /api/auth/switch-org`.
- API-key requests ignore this header.

## Runtime Notes

- The SDK uses the generated `fetch` client from `openapi-typescript-codegen`.
- It works in browser bundlers and modern Node runtimes that provide `fetch`.
- Configure the API base URL and auth headers through the SDK config.

## Exports

The package exports:

- `EnvSyncAPISDK`
- `OpenAPI`
- `ApiError` and other core request types
- generated models and services from the EnvSync OpenAPI spec

## Regeneration

The source for this package is generated from the EnvSync API OpenAPI spec.

- Regenerate locally with `bun run generate:local`
- Build with `bun run build`

Do not hand-edit generated source under `src/`; regeneration will overwrite it.

## Links

- Repository: https://github.com/EnvSync-Cloud/envsync
- Issues: https://github.com/EnvSync-Cloud/envsync/issues
- Monorepo docs: https://github.com/EnvSync-Cloud/envsync#readme
- Self-hosting guide: https://github.com/EnvSync-Cloud/envsync/blob/main/SELFHOSTING.md

## Releases

Published npm releases are tied to monorepo tags in the form `vX.Y.Z`.
