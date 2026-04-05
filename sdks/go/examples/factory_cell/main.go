package main

import (
	"fmt"
	"log"
	"time"

	"github.com/sint-ai/sint-protocol/sdks/go/sintclient"
)

func main() {
	client := sintclient.New("http://localhost:3100", "dev-local-key").
		WithRetry(2, 150*time.Millisecond)

	var health map[string]any
	if err := client.Health(&health); err != nil {
		log.Fatal(err)
	}
	fmt.Println("health:", health["status"])

	req := map[string]any{
		"requestId": "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f799",
		"timestamp": time.Now().UTC().Format("2006-01-02T15:04:05.000000Z"),
		"agentId":   "factory-cell-agent",
		"tokenId":   "replace-with-valid-token-id",
		"resource":  "open-rmf:///dispatch/fleet-a",
		"action":    "call",
		"params": map[string]any{
			"taskId":      "cell-cycle-42",
			"operation":   "start_cycle",
			"targetRobot": "arm-7",
		},
	}

	var decision map[string]any
	if err := client.Intercept(req, &decision); err != nil {
		log.Fatal(err)
	}
	fmt.Println("decision:", decision["action"], "tier=", decision["assignedTier"])
}
