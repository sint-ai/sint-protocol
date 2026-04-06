use serde::{Deserialize, Serialize};

/// SINT capability token — Ed25519-signed authorization credential.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SintCapabilityToken {
    pub token_id: String,
    pub issuer: String,
    pub subject: String,
    pub resource: String,
    pub actions: Vec<String>,
    pub issued_at: String,
    pub expires_at: String,
    pub signature: String,
    pub revocable: bool,
}

/// Approval tier — determines human oversight requirement.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ApprovalTier {
    #[serde(rename = "T0_observe")]
    T0Observe,
    #[serde(rename = "T1_prepare")]
    T1Prepare,
    #[serde(rename = "T2_act")]
    T2Act,
    #[serde(rename = "T3_commit")]
    T3Commit,
}

/// PolicyGateway intercept request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SintRequest {
    pub request_id: String,
    pub timestamp: String,
    pub agent_id: String,
    pub token_id: String,
    pub resource: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// PolicyGateway decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyDecision {
    pub request_id: String,
    pub action: DecisionAction,
    pub tier: ApprovalTier,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_tier: Option<ApprovalTier>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DecisionAction {
    Allow,
    Deny,
    Escalate,
}

/// Gateway health response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayHealth {
    pub status: String,
}

/// Token issuance request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueTokenRequest {
    pub subject: String,
    pub resource: String,
    pub actions: Vec<String>,
    pub expires_in_hours: Option<u32>,
}
