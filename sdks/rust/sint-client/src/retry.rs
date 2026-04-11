//! Exponential back-off retry helper.

use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;

/// Configuration for automatic retry with exponential back-off.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of total attempts (including the first).
    pub max_attempts: u32,
    /// Delay before the second attempt, in milliseconds.
    pub initial_delay_ms: u64,
    /// Cap on the inter-attempt delay, in milliseconds.
    pub max_delay_ms: u64,
    /// Multiplier applied to the delay after each failure.
    pub backoff_multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay_ms: 100,
            max_delay_ms: 5000,
            backoff_multiplier: 2.0,
        }
    }
}

/// Execute `f` up to `config.max_attempts` times, sleeping with exponential
/// back-off between failures.  Returns the first `Ok` value, or the last `Err`
/// after all attempts are exhausted.
pub async fn with_retry<F, Fut, T, E>(config: &RetryConfig, mut f: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut delay_ms = config.initial_delay_ms;
    for attempt in 0..config.max_attempts {
        match f().await {
            Ok(val) => return Ok(val),
            Err(e) => {
                if attempt + 1 == config.max_attempts {
                    return Err(e);
                }
                sleep(Duration::from_millis(delay_ms)).await;
                delay_ms = ((delay_ms as f64) * config.backoff_multiplier) as u64;
                delay_ms = delay_ms.min(config.max_delay_ms);
            }
        }
    }
    unreachable!()
}
