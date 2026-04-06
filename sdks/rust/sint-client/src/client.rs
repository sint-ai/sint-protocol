use crate::{error::Result, types::*};
use reqwest::Client;
use serde_json::Value;

/// Configuration for the SINT client.
pub struct SintClientConfig {
    pub gateway_url: String,
    pub api_key: Option<String>,
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

    fn build_request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url(), path);
        let mut req = self.http.request(method, url);
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        req
    }

    /// Check gateway health.
    pub async fn health(&self) -> Result<GatewayHealth> {
        let resp = self.build_request(reqwest::Method::GET, "/health").send().await?;
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
            let message = body.get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("unknown error")
                .to_string();
            return Err(crate::error::SintError::Gateway { status, message });
        }

        Ok(resp.json::<PolicyDecision>().await?)
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
            let message = body.get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("unknown error")
                .to_string();
            return Err(crate::error::SintError::Gateway { status, message });
        }

        Ok(resp.json::<SintCapabilityToken>().await?)
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
}
