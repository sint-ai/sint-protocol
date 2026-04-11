//! Fluent builder for [`SintRequest`].

use crate::types::{PhysicalContext, SintRequest};
use uuid::Uuid;

/// Fluent builder for constructing a [`SintRequest`].
///
/// Auto-generates `request_id` (UUIDv4) and `timestamp` (ISO 8601) on [`build`](Self::build).
pub struct SintRequestBuilder {
    agent_id: Option<String>,
    token_id: Option<String>,
    resource: Option<String>,
    action: Option<String>,
    params: Option<serde_json::Value>,
    physical_context: Option<PhysicalContext>,
}

impl SintRequestBuilder {
    /// Create a new, empty builder.
    pub fn new() -> Self {
        Self {
            agent_id: None,
            token_id: None,
            resource: None,
            action: None,
            params: None,
            physical_context: None,
        }
    }

    /// Set the agent ID (Ed25519 public key hex).
    pub fn agent_id(mut self, id: impl Into<String>) -> Self {
        self.agent_id = Some(id.into());
        self
    }

    /// Set the capability token ID.
    pub fn token_id(mut self, id: impl Into<String>) -> Self {
        self.token_id = Some(id.into());
        self
    }

    /// Set the resource URI (e.g. `"mcp://filesystem/readFile"`).
    pub fn resource(mut self, r: impl Into<String>) -> Self {
        self.resource = Some(r.into());
        self
    }

    /// Set the action (e.g. `"call"`, `"publish"`).
    pub fn action(mut self, a: impl Into<String>) -> Self {
        self.action = Some(a.into());
        self
    }

    /// Attach arbitrary JSON parameters.
    pub fn params(mut self, p: serde_json::Value) -> Self {
        self.params = Some(p);
        self
    }

    /// Attach physical sensor context.
    pub fn physical_context(mut self, ctx: PhysicalContext) -> Self {
        self.physical_context = Some(ctx);
        self
    }

    /// Build the [`SintRequest`].
    ///
    /// Returns `Err` if any of the required fields (`agent_id`, `token_id`,
    /// `resource`, `action`) are missing.  `request_id` and `timestamp` are
    /// generated automatically.
    pub fn build(self) -> Result<SintRequest, String> {
        let agent_id = self.agent_id.ok_or("agent_id is required")?;
        let token_id = self.token_id.ok_or("token_id is required")?;
        let resource = self.resource.ok_or("resource is required")?;
        let action = self.action.ok_or("action is required")?;

        let request_id = Uuid::new_v4().to_string();

        // ISO 8601 timestamp using std — no external date dependency needed.
        let timestamp = {
            use std::time::{SystemTime, UNIX_EPOCH};
            let secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            // Format as YYYY-MM-DDTHH:MM:SS.000000Z
            let s = secs % 60;
            let m = (secs / 60) % 60;
            let h = (secs / 3600) % 24;
            let days = secs / 86400; // days since epoch

            // Gregorian calendar computation
            let (year, month, day) = epoch_days_to_date(days);
            format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000000Z",
                year, month, day, h, m, s
            )
        };

        Ok(SintRequest {
            request_id,
            timestamp,
            agent_id,
            token_id,
            resource,
            action,
            params: self.params,
            physical_context: self.physical_context,
        })
    }
}

impl Default for SintRequestBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert days since Unix epoch (1970-01-01) to (year, month, day).
fn epoch_days_to_date(days: u64) -> (u64, u64, u64) {
    // Algorithm from https://howardhinnant.github.io/date_algorithms.html
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as u64, m as u64, d as u64)
}
