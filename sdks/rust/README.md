# sint-client — Rust SDK for SINT Protocol

`sint-client` is the official Rust client library for the [SINT Protocol](https://github.com/sint-ai/sint-protocol) PolicyGateway. It provides typed structs for capability tokens, policy decisions, and an async HTTP client for gateway integration.

## Requirements

Rust 1.75+ (async fn in traits, MSRV for `reqwest` 0.12 with `rustls-tls`).

## Installation

```toml
[dependencies]
sint-client = "0.1"
```

Or via cargo:

```bash
cargo add sint-client
```

## Basic Usage

```rust
use sint_client::{SintClient, SintClientConfig, SintRequest};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SintClient::new(SintClientConfig {
        gateway_url: "http://localhost:3100".to_string(),
        api_key: std::env::var("SINT_API_KEY").ok(),
    });

    let health = client.health().await?;
    println!("Gateway: {}", health.status);

    let decision = client.intercept(&SintRequest {
        request_id: "01905f7c-4e8a-7000-8000-000000000001".to_string(),
        timestamp: "2026-04-05T10:00:00.000000Z".to_string(),
        agent_id: "<ed25519-pubkey-hex>".to_string(),
        token_id: "<token-uuid-v7>".to_string(),
        resource: "ros2:///cmd_vel".to_string(),
        action: "publish".to_string(),
        params: None,
    }).await?;

    println!("Decision: {:?}", decision.action);
    Ok(())
}
```

## More Information

- Protocol spec: [`docs/specs/sint-protocol-v1.0.md`](../../docs/specs/sint-protocol-v1.0.md)
- Main repo: <https://github.com/sint-ai/sint-protocol>
