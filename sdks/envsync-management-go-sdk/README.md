# EnvSync Management Go SDK

Private Go SDK scaffold for the Management API.

The generated client is produced from the Management API OpenAPI surface using Fern.

## Multi-Org Bearer Token Usage

If one identity belongs to multiple organizations, bearer-token clients can
select the org for a single request by sending `X-EnvSync-Org-Id`.

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	enterprise "github.com/envsync-cloud/envsync-management-go-sdk/sdk/enterprise"
	"github.com/envsync-cloud/envsync-management-go-sdk/sdk/option"
)

func main() {
	c := enterprise.NewClient(
		option.WithBaseURL("https://manage-api.envsync.cloud"),
		option.WithToken(os.Getenv("ENVSYNC_TOKEN")),
		option.WithHTTPHeader(http.Header{
			"X-EnvSync-Org-Id": []string{os.Getenv("ENVSYNC_ORG_ID")},
		}),
	)

	providers, err := c.ListEnterpriseProviders(context.Background())
	if err != nil {
		panic(err)
	}

	fmt.Println(len(providers.GetProviders()))
}
```

Notes:

- `X-EnvSync-Org-Id` is honored only for bearer-token requests.
- Cookie-session clients should continue using `POST /api/auth/switch-org`.
- API-key requests ignore this header.

## Regeneration

```bash
./generator.sh
```

The `openapi.json` file should be refreshed from the Management API before running Fern generation.
