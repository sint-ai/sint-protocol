//! SINT Protocol — Rust client library.
//!
//! Provides typed structs for SINT capability tokens, policy decisions,
//! and a thin async HTTP client for the SINT gateway server.
//!
//! # Example
//! ```rust,no_run
//! use sint_client::{SintClient, SintClientConfig};
//!
//! #[tokio::main]
//! async fn main() -> anyhow::Result<()> {
//!     let client = SintClient::new(SintClientConfig {
//!         gateway_url: "http://localhost:3100".to_string(),
//!         api_key: std::env::var("SINT_API_KEY").ok(),
//!     });
//!     let status = client.health().await?;
//!     println!("Gateway status: {}", status.status);
//!     Ok(())
//! }
//! ```

pub mod types;
pub mod client;
pub mod error;

pub use client::SintClient;
pub use types::*;
pub use error::SintError;
