# SINT Go SDK

## Usage

```go
package main

import (
	"fmt"
	"log"

	"github.com/sint-ai/sint-protocol/sdks/go/sintclient"
)

func main() {
	client := sintclient.New("http://localhost:3100", "dev-local-key")
		.WithRetry(2, 150*time.Millisecond)
	var discovery map[string]any
	if err := client.Discovery(&discovery); err != nil {
		log.Fatal(err)
	}
	fmt.Println(discovery["version"])
}
```

## Surface

- discovery and health
- openapi
- token issue and revoke
- intercept (single and batch)
- approvals list/get/resolve
- ledger query + proof
- compliance crosswalk
- economy route helper
- retry/backoff helpers for transient failures
- typed `GatewayError` for status/body inspection

## Examples

- Warehouse/factory flow example: [`examples/factory_cell/main.go`](examples/factory_cell/main.go)
