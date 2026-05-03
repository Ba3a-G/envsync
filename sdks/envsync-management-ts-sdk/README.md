# `@envsync-cloud/envsync-management-ts-sdk`

Private TypeScript SDK for the EnvSync Management API.

This package provides the generated fetch-based client, models, and service
types for interacting with the Enterprise management surface from browser or
server-side TypeScript applications.

## Install

```bash
npm install @envsync-cloud/envsync-management-ts-sdk
```

```bash
bun add @envsync-cloud/envsync-management-ts-sdk
```

```bash
pnpm add @envsync-cloud/envsync-management-ts-sdk
```

## Basic Usage

```ts
import { EnvSyncManagementAPISDK } from "@envsync-cloud/envsync-management-ts-sdk";

const sdk = new EnvSyncManagementAPISDK({
  BASE: "https://manage-api.envsync.cloud",
  WITH_CREDENTIALS: true,
  CREDENTIALS: "include",
});

const status = await sdk.system.getManagementSystemStatus();

console.log(status.system.edition);
```

## Multi-Org Bearer Token Usage

If one identity belongs to multiple organizations, bearer-token clients can
select the org for a single request by sending `X-EnvSync-Org-Id`.

```ts
import { EnvSyncManagementAPISDK } from "@envsync-cloud/envsync-management-ts-sdk";

const sdk = new EnvSyncManagementAPISDK({
	BASE: "https://manage-api.envsync.cloud",
	TOKEN: process.env.ENVSYNC_TOKEN,
	HEADERS: async () => ({
		"X-EnvSync-Org-Id": process.env.ENVSYNC_ORG_ID ?? "",
	}),
});

const providers = await sdk.enterprise.listEnterpriseProviders();

console.log(providers.providers.length);
```

Notes:

- `X-EnvSync-Org-Id` is honored only for bearer-token requests.
- Cookie-session clients should continue using `POST /api/auth/switch-org`.
- API-key requests ignore this header.

## Runtime Notes

- The SDK uses the generated `fetch` client from `openapi-typescript-codegen`.
- It works in browser bundlers and modern Node runtimes that provide `fetch`.
- Configure the Management API base URL and auth or CSRF headers through the SDK config.

## Exports

The package exports:

- `EnvSyncManagementAPISDK`
- `OpenAPI`
- `ApiError` and other core request types
- generated models and services from the EnvSync Management API OpenAPI spec

## Regeneration

The source for this package is generated from the EnvSync Management API OpenAPI spec.

- Regenerate locally with `bun run generate:local`
- Build with `bun run build`

Do not hand-edit generated source under `src/`; regeneration will overwrite it.

## Links

- Repository: https://github.com/EnvSync-Cloud/envsync
- Issues: https://github.com/EnvSync-Cloud/envsync/issues
- Monorepo docs: https://github.com/EnvSync-Cloud/envsync#readme

## Releases

Private releases are published from monorepo tags in the form `vX.Y.Z`.
