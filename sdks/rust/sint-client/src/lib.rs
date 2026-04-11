//! SINT Protocol — Rust client library.
//!
//! Provides typed structs for SINT capability tokens, policy decisions,
//! and a thin async HTTP client for the SINT gateway server.
//!
//! # Example
//! ```rust,no_run
//! use sint_client::{SintClient, SintClientConfig, RetryConfig};
//!
//! #[tokio::main]
//! async fn main() -> anyhow::Result<()> {
//!     let client = SintClient::new(SintClientConfig {
//!         gateway_url: "http://localhost:3100".to_string(),
//!         api_key: std::env::var("SINT_API_KEY").ok(),
//!         retry_config: RetryConfig::default(),
//!     });
//!     let status = client.health().await?;
//!     println!("Gateway status: {}", status.status);
//!     Ok(())
//! }
//! ```

pub mod builder;
pub mod client;
pub mod error;
pub mod retry;
pub mod types;

pub use builder::SintRequestBuilder;
pub use client::{SintClient, SintClientConfig};
pub use error::SintError;
pub use retry::RetryConfig;
pub use types::*;
