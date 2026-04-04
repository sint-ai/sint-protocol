# SINT Go SDK (Minimal)

## Usage

```go
package main

import (
	"fmt"
	"log"

	"example.com/sint/sintclient"
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
- token issue and revoke
- intercept (single and batch)
- approvals list and resolve
