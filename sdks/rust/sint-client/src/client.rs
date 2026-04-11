use crate::{builder::SintRequestBuilder, error::Result, retry, retry::RetryConfig, types::*};
use reqwest::Client;
use serde_json::Value;

/// Configuration for the SINT client.
pub struct SintClientConfig {
    pub gateway_url: String,
    pub api_key: Option<String>,
    pub retry_config: RetryConfig,
}

impl Default for SintClientConfig {
    fn default() -> Self {
        Self {
            gateway_url: "http://localhost:3100".to_string(),
            api_key: None,
            retry_config: RetryConfig::default(),
        }
    }
}

/// Async SINT gateway client.
pub struct SintClient {
    http: Client,
    config: SintClientConfig,
}

impl SintClient {
    pub fn new(config: SintClientConfig) -> Self {
        Self {
            http: Client::new(),
            config,
        }
    }

    fn base_url(&self) -> &str {
        &self.config.gateway_url
    }

    fn auth_header(&self) -> Option<String> {
        self.config.api_key.as_ref().map(|k| format!("Bearer {k}"))
    }

    pub(crate) fn build_request(
        &self,
        method: reqwest::Method,
        path: &str,
    ) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url(), path);
        let mut req = self.http.request(method, url);
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        req
    }

    /// Check gateway health.
    pub async fn health(&self) -> Result<GatewayHealth> {
        let resp = self
            .build_request(reqwest::Method::GET, "/health")
            .send()
            .await?;
        let health = resp.json::<GatewayHealth>().await?;
        Ok(health)
    }

    /// Submit a request through the PolicyGateway.
    pub async fn intercept(&self, request: &SintRequest) -> Result<PolicyDecision> {
        let resp = self
            .build_request(reqwest::Method::POST, "/v1/intercept")
            .json(request)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.json::<Value>().await.unwrap_or_default();
            let message = body
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("unknown error")
                .to_string();
            return Err(crate::error::SintError::Gateway { status, message });
        }

        Ok(resp.json::<PolicyDecision>().await?)
    }

    /// Submit a request through the PolicyGateway, retrying on network errors
    /// according to the client's [`RetryConfig`].
    pub async fn intercept_with_retry(&self, request: &SintRequest) -> Result<PolicyDecision> {
        retry::with_retry(&self.config.retry_config, || self.intercept(request)).await
    }

    /// Issue a new capability token (requires admin API key).
    pub async fn issue_token(&self, req: &IssueTokenRequest) -> Result<SintCapabilityToken> {
        let resp = self
            .build_request(reqwest::Method::POST, "/v1/tokens/issue")
            .json(req)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.json::<Value>().await.unwrap_or_default();
            let message = body
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("unknown error")
                .to_string();
            return Err(crate::error::SintError::Gateway { status, message });
        }

        Ok(resp.json::<SintCapabilityToken>().await?)
    }

    /// Revoke a capability token.
    pub async fn revoke_token(&self, req: &TokenRevocationRequest) -> Result<RevocationRecord> {
        let resp = self
            .build_request(reqwest::Method::POST, "/v1/tokens/revoke")
            .json(req)
            .send()
            .await?;
        Ok(resp.json::<RevocationRecord>().await?)
    }

    /// Query ledger events.
    pub async fn query_ledger(&self, query: &LedgerQuery) -> Result<Vec<LedgerEvent>> {
        let mut params: Vec<String> = vec![];
        if let Some(ref agent_id) = query.agent_id {
            params.push(format!("agentId={agent_id}"));
        }
        if let Some(ref event_type) = query.event_type {
            params.push(format!("eventType={event_type}"));
        }
        if let Some(ref resource) = query.resource {
            params.push(format!("resource={resource}"));
        }
        if let Some(limit) = query.limit {
            params.push(format!("limit={limit}"));
        }

        let qs = if params.is_empty() {
            String::new()
        } else {
            format!("?{}", params.join("&"))
        };

        let resp = self
            .build_request(reqwest::Method::GET, &format!("/v1/ledger/query{qs}"))
            .send()
            .await?;
        Ok(resp.json::<Vec<LedgerEvent>>().await?)
    }

    /// Check CSML score for an agent.
    pub async fn csml_score(&self, agent_id: &str) -> Result<Value> {
        let resp = self
            .build_request(reqwest::Method::GET, &format!("/v1/csml/{agent_id}"))
            .send()
            .await?;
        Ok(resp.json::<Value>().await?)
    }

    /// List active delegations.
    pub async fn list_delegations(&self) -> Result<Value> {
        let resp = self
            .build_request(reqwest::Method::GET, "/v1/delegations")
            .send()
            .await?;
        Ok(resp.json::<Value>().await?)
    }

    /// Create a request using the fluent builder.
    pub fn request(&self) -> SintRequestBuilder {
        SintRequestBuilder::new()
    }
}
