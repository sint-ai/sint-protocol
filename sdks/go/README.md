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
