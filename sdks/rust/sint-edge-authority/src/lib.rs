//! Deterministic, network-independent evaluator for SINT Mission Authority.
//!
//! The crate evaluates externally proposed actions. It never generates targets,
//! effects, routes, or engagement recommendations.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MissionClass {
    Logistics,
    CasualtyEvac,
    CivilianRescue,
    Inspection,
    Isr,
    ForceProtection,
    CounterUas,
    OperatorSupervisedEffects,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EffectType {
    None,
    NonKinetic,
    Kinetic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectConstraint {
    pub effect_id: String,
    pub effect_type: EffectType,
    pub resource: String,
    pub actions: Vec<String>,
    pub max_uses: u32,
    pub operator_authorization_required: bool,
    pub minimum_approval_quorum: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalPolicy {
    pub minimum_quorum: u8,
    pub authorized_operator_ids: Vec<String>,
    pub authorization_max_age_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AbortSignal {
    Estop,
    AuthorityRevoked,
    MissionExpired,
    GeofenceExit,
    LocalizationStale,
    CommunicationsLost,
    AutonomyCompromised,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AbortResponse {
    Terminate,
    Hold,
    ReturnToSafeState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbortCondition {
    pub condition_id: String,
    pub signal: AbortSignal,
    pub response: AbortResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grace_period_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionManifest {
    pub manifest_id: String,
    pub protocol_version: String,
    pub manifest_version: u32,
    pub issuer: String,
    pub platform_id: String,
    pub platform_identity: String,
    pub mission_class: MissionClass,
    pub valid_from: String,
    pub valid_until: String,
    pub resources: Vec<String>,
    pub actions: Vec<String>,
    pub effect_constraints: Vec<EffectConstraint>,
    pub approval_policy: ApprovalPolicy,
    pub abort_conditions: Vec<AbortCondition>,
    pub max_delegation_depth: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_manifest_id: Option<String>,
    pub delegation_depth: u8,
    pub policy_hash: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorityHead {
    pub platform_identity: String,
    pub manifest_id: String,
    pub manifest_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorAuthorization {
    pub authorization_id: String,
    pub manifest_id: String,
    pub action_ref: String,
    pub operator_id: String,
    pub decision: AuthorizationDecision,
    pub issued_at: String,
    pub expires_at: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthorizationDecision {
    Approve,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionProposal {
    pub action_ref: String,
    pub platform_id: String,
    pub platform_identity: String,
    pub resource: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effect_id: Option<String>,
    pub communications_available: bool,
    pub autonomy_compromised: bool,
    pub authority_revoked: bool,
    pub operator_authorizations: Vec<OperatorAuthorization>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DecisionAction {
    Allow,
    Deny,
    Escalate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorityDecision {
    pub action_ref: String,
    pub manifest_id: String,
    pub action: DecisionAction,
    pub evaluated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_approval_quorum: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_approval_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub abort_response: Option<AbortResponse>,
}

pub trait ManifestVerifier {
    fn verify_manifest(&self, manifest: &MissionManifest) -> bool;
    fn verify_operator_authorization(&self, authorization: &OperatorAuthorization) -> bool;
}

pub trait HardwareSigner {
    fn public_key(&self) -> &str;
    fn sign_digest(&self, digest: &[u8; 32]) -> Result<Vec<u8>, String>;
}

pub fn canonical_sha256<T: Serialize>(value: &T) -> Result<[u8; 32], String> {
    let value = serde_json::to_value(value).map_err(|error| error.to_string())?;
    let canonical = canonicalize(&value);
    let bytes = serde_json::to_vec(&canonical).map_err(|error| error.to_string())?;
    Ok(Sha256::digest(bytes).into())
}

fn canonicalize(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Array(values) => {
            serde_json::Value::Array(values.iter().map(canonicalize).collect())
        }
        serde_json::Value::Object(values) => {
            let sorted: BTreeMap<_, _> = values
                .iter()
                .map(|(key, value)| (key.clone(), canonicalize(value)))
                .collect();
            serde_json::to_value(sorted).expect("BTreeMap is JSON serializable")
        }
        _ => value.clone(),
    }
}

fn millis(timestamp: &str) -> Option<i128> {
    OffsetDateTime::parse(timestamp, &Rfc3339)
        .ok()
        .map(|value| value.unix_timestamp_nanos() / 1_000_000)
}

fn abort_for(manifest: &MissionManifest, signal: AbortSignal) -> Option<AbortResponse> {
    manifest
        .abort_conditions
        .iter()
        .find(|condition| condition.signal == signal)
        .map(|condition| condition.response.clone())
}

fn decision(
    manifest: &MissionManifest,
    proposal: &ActionProposal,
    evaluated_at: &str,
    action: DecisionAction,
    reason_code: Option<&str>,
    abort_response: Option<AbortResponse>,
) -> AuthorityDecision {
    AuthorityDecision {
        action_ref: proposal.action_ref.clone(),
        manifest_id: manifest.manifest_id.clone(),
        action,
        evaluated_at: evaluated_at.to_string(),
        reason_code: reason_code.map(str::to_string),
        required_approval_quorum: None,
        observed_approval_count: None,
        abort_response,
    }
}

fn manifest_policy_valid(manifest: &MissionManifest) -> bool {
    manifest.delegation_depth <= manifest.max_delegation_depth
        && manifest.effect_constraints.iter().all(|effect| {
            effect.effect_type != EffectType::Kinetic
                || (effect.operator_authorization_required && effect.minimum_approval_quorum >= 1)
        })
}

pub fn evaluate<V: ManifestVerifier>(
    verifier: &V,
    manifest: &MissionManifest,
    proposal: &ActionProposal,
    evaluated_at: &str,
    effect_use_count: u32,
) -> AuthorityDecision {
    let now = match millis(evaluated_at) {
        Some(value) => value,
        None => {
            return decision(
                manifest,
                proposal,
                evaluated_at,
                DecisionAction::Deny,
                Some("INVALID_TIME"),
                None,
            )
        }
    };
    if !verifier.verify_manifest(manifest) {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("INVALID_MANIFEST_SIGNATURE"),
            None,
        );
    }
    if !manifest_policy_valid(manifest) {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("INVALID_MANIFEST_POLICY"),
            None,
        );
    }
    if now < millis(&manifest.valid_from).unwrap_or(i128::MAX) {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("MANIFEST_NOT_YET_VALID"),
            None,
        );
    }
    if now >= millis(&manifest.valid_until).unwrap_or(i128::MIN) {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("MANIFEST_EXPIRED"),
            abort_for(manifest, AbortSignal::MissionExpired),
        );
    }
    if proposal.platform_id != manifest.platform_id
        || proposal.platform_identity != manifest.platform_identity
    {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("WRONG_PLATFORM"),
            None,
        );
    }
    if proposal.authority_revoked {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("AUTHORITY_REVOKED"),
            abort_for(manifest, AbortSignal::AuthorityRevoked),
        );
    }
    if proposal.autonomy_compromised {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("AUTONOMY_COMPROMISED"),
            abort_for(manifest, AbortSignal::AutonomyCompromised),
        );
    }
    if !proposal.communications_available {
        if let Some(response) = abort_for(manifest, AbortSignal::CommunicationsLost) {
            return decision(
                manifest,
                proposal,
                evaluated_at,
                DecisionAction::Deny,
                Some("COMMUNICATIONS_POLICY_VIOLATION"),
                Some(response),
            );
        }
    }
    if !manifest.resources.contains(&proposal.resource) {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("RESOURCE_OUT_OF_SCOPE"),
            None,
        );
    }
    if !manifest.actions.contains(&proposal.action) {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("ACTION_OUT_OF_SCOPE"),
            None,
        );
    }

    let effect = proposal.effect_id.as_ref().and_then(|effect_id| {
        manifest
            .effect_constraints
            .iter()
            .find(|effect| &effect.effect_id == effect_id)
    });
    if proposal.effect_id.is_some() && effect.is_none() {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("EFFECT_NOT_AUTHORIZED"),
            None,
        );
    }
    if let Some(effect) = effect {
        if effect.resource != proposal.resource || !effect.actions.contains(&proposal.action) {
            return decision(
                manifest,
                proposal,
                evaluated_at,
                DecisionAction::Deny,
                Some("EFFECT_NOT_AUTHORIZED"),
                None,
            );
        }
        if effect_use_count >= effect.max_uses {
            return decision(
                manifest,
                proposal,
                evaluated_at,
                DecisionAction::Deny,
                Some("EFFECT_USE_LIMIT_EXCEEDED"),
                None,
            );
        }
    }

    let required_quorum = manifest
        .approval_policy
        .minimum_quorum
        .max(effect.map_or(0, |value| value.minimum_approval_quorum));
    let allowed: BTreeSet<_> = manifest
        .approval_policy
        .authorized_operator_ids
        .iter()
        .collect();
    let relevant: Vec<_> = proposal
        .operator_authorizations
        .iter()
        .filter(|authorization| {
            authorization.manifest_id == manifest.manifest_id
                && authorization.action_ref == proposal.action_ref
                && allowed.contains(&authorization.operator_id)
                && verifier.verify_operator_authorization(authorization)
        })
        .collect();
    if relevant
        .iter()
        .any(|authorization| authorization.decision == AuthorizationDecision::Deny)
    {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("OPERATOR_DENIED"),
            None,
        );
    }

    let fresh: BTreeSet<_> = relevant
        .iter()
        .filter(|authorization| {
            let issued = millis(&authorization.issued_at).unwrap_or(i128::MAX);
            let expires = millis(&authorization.expires_at).unwrap_or(i128::MIN);
            authorization.decision == AuthorizationDecision::Approve
                && issued <= now
                && expires > now
                && now - issued <= manifest.approval_policy.authorization_max_age_ms as i128
        })
        .map(|authorization| &authorization.operator_id)
        .collect();

    if fresh.len() < required_quorum as usize {
        let mut result = decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Escalate,
            Some(if relevant.len() > fresh.len() {
                "AUTHORIZATION_STALE"
            } else {
                "APPROVAL_QUORUM_NOT_MET"
            }),
            None,
        );
        result.required_approval_quorum = Some(required_quorum);
        result.observed_approval_count = Some(fresh.len());
        return result;
    }

    let mut result = decision(
        manifest,
        proposal,
        evaluated_at,
        DecisionAction::Allow,
        None,
        None,
    );
    result.required_approval_quorum = Some(required_quorum);
    result.observed_approval_count = Some(fresh.len());
    result
}

/// Evaluate against the locally persisted authority high-water mark.
///
/// Disconnected deployments must persist this state in rollback-resistant
/// storage and only replace it after validating a higher-version direct child.
pub fn evaluate_with_authority_head<V: ManifestVerifier>(
    verifier: &V,
    manifest: &MissionManifest,
    proposal: &ActionProposal,
    evaluated_at: &str,
    effect_use_count: u32,
    authority_head: &AuthorityHead,
) -> AuthorityDecision {
    if authority_head.platform_identity != manifest.platform_identity {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("INVALID_AUTHORITY_HEAD"),
            None,
        );
    }
    if authority_head.manifest_id != manifest.manifest_id
        || authority_head.manifest_version != manifest.manifest_version
    {
        return decision(
            manifest,
            proposal,
            evaluated_at,
            DecisionAction::Deny,
            Some("MANIFEST_SUPERSEDED"),
            abort_for(manifest, AbortSignal::AuthorityRevoked),
        );
    }
    evaluate(verifier, manifest, proposal, evaluated_at, effect_use_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    struct AcceptSignatures;
    impl ManifestVerifier for AcceptSignatures {
        fn verify_manifest(&self, _: &MissionManifest) -> bool {
            true
        }
        fn verify_operator_authorization(&self, _: &OperatorAuthorization) -> bool {
            true
        }
    }

    fn manifest() -> MissionManifest {
        MissionManifest {
            manifest_id: "manifest-1".into(),
            protocol_version: "0.3.0".into(),
            manifest_version: 1,
            issuer: "issuer".into(),
            platform_id: "px4-1".into(),
            platform_identity: "platform-key".into(),
            mission_class: MissionClass::OperatorSupervisedEffects,
            valid_from: "2026-06-06T10:00:00Z".into(),
            valid_until: "2026-06-06T12:00:00Z".into(),
            resources: vec!["mavlink://effects".into()],
            actions: vec!["execute".into()],
            effect_constraints: vec![EffectConstraint {
                effect_id: "effect-1".into(),
                effect_type: EffectType::Kinetic,
                resource: "mavlink://effects".into(),
                actions: vec!["execute".into()],
                max_uses: 1,
                operator_authorization_required: true,
                minimum_approval_quorum: 1,
            }],
            approval_policy: ApprovalPolicy {
                minimum_quorum: 1,
                authorized_operator_ids: vec!["operator-1".into()],
                authorization_max_age_ms: 60_000,
            },
            abort_conditions: vec![AbortCondition {
                condition_id: "comms".into(),
                signal: AbortSignal::CommunicationsLost,
                response: AbortResponse::Hold,
                grace_period_ms: None,
            }],
            max_delegation_depth: 2,
            parent_manifest_id: None,
            delegation_depth: 0,
            policy_hash: "hash".into(),
            signature: "signature".into(),
        }
    }

    fn proposal() -> ActionProposal {
        ActionProposal {
            action_ref: "action-1".into(),
            platform_id: "px4-1".into(),
            platform_identity: "platform-key".into(),
            resource: "mavlink://effects".into(),
            action: "execute".into(),
            effect_id: Some("effect-1".into()),
            communications_available: true,
            autonomy_compromised: false,
            authority_revoked: false,
            operator_authorizations: vec![],
        }
    }

    fn authority_head(manifest: &MissionManifest) -> AuthorityHead {
        AuthorityHead {
            platform_identity: manifest.platform_identity.clone(),
            manifest_id: manifest.manifest_id.clone(),
            manifest_version: manifest.manifest_version,
        }
    }

    #[test]
    fn escalates_without_operator_quorum() {
        let result = evaluate(
            &AcceptSignatures,
            &manifest(),
            &proposal(),
            "2026-06-06T10:30:00Z",
            0,
        );
        assert_eq!(result.action, DecisionAction::Escalate);
    }

    #[test]
    fn rejects_manifest_that_does_not_match_persisted_authority_head() {
        let mission = manifest();
        let mut head = authority_head(&mission);
        head.manifest_id = "manifest-2".into();
        head.manifest_version = 2;

        let result = evaluate_with_authority_head(
            &AcceptSignatures,
            &mission,
            &proposal(),
            "2026-06-06T10:30:00Z",
            0,
            &head,
        );
        assert_eq!(result.action, DecisionAction::Deny);
        assert_eq!(result.reason_code.as_deref(), Some("MANIFEST_SUPERSEDED"));
    }

    #[test]
    fn accepts_manifest_at_persisted_authority_head() {
        let mission = manifest();
        let result = evaluate_with_authority_head(
            &AcceptSignatures,
            &mission,
            &proposal(),
            "2026-06-06T10:30:00Z",
            0,
            &authority_head(&mission),
        );
        assert_eq!(result.action, DecisionAction::Escalate);
    }

    #[test]
    fn permits_with_fresh_signed_operator_authorization() {
        let mut proposal = proposal();
        proposal
            .operator_authorizations
            .push(OperatorAuthorization {
                authorization_id: "approval-1".into(),
                manifest_id: "manifest-1".into(),
                action_ref: "action-1".into(),
                operator_id: "operator-1".into(),
                decision: AuthorizationDecision::Approve,
                issued_at: "2026-06-06T10:29:30Z".into(),
                expires_at: "2026-06-06T10:31:00Z".into(),
                signature: "signature".into(),
            });
        let result = evaluate(
            &AcceptSignatures,
            &manifest(),
            &proposal,
            "2026-06-06T10:30:00Z",
            0,
        );
        assert_eq!(result.action, DecisionAction::Allow);
    }

    #[test]
    fn fails_closed_on_communications_loss() {
        let mut proposal = proposal();
        proposal.communications_available = false;
        let result = evaluate(
            &AcceptSignatures,
            &manifest(),
            &proposal,
            "2026-06-06T10:30:00Z",
            0,
        );
        assert_eq!(result.action, DecisionAction::Deny);
        assert_eq!(result.abort_response, Some(AbortResponse::Hold));
    }

    #[test]
    fn rejects_kinetic_effect_without_operator_authority() {
        let mut manifest = manifest();
        manifest.effect_constraints[0].operator_authorization_required = false;
        manifest.effect_constraints[0].minimum_approval_quorum = 0;
        let result = evaluate(
            &AcceptSignatures,
            &manifest,
            &proposal(),
            "2026-06-06T10:30:00Z",
            0,
        );
        assert_eq!(result.action, DecisionAction::Deny);
        assert_eq!(
            result.reason_code.as_deref(),
            Some("INVALID_MANIFEST_POLICY")
        );
    }

    #[test]
    fn local_evaluation_p99_is_below_one_millisecond() {
        let manifest = manifest();
        let proposal = proposal();
        let mut samples = Vec::with_capacity(2_000);

        for _ in 0..2_000 {
            let start = Instant::now();
            let _ = evaluate(
                &AcceptSignatures,
                &manifest,
                &proposal,
                "2026-06-06T10:30:00Z",
                0,
            );
            samples.push(start.elapsed());
        }

        samples.sort();
        let p99 = samples[(samples.len() * 99) / 100];
        assert!(
            p99.as_micros() < 1_000,
            "edge authority p99 was {p99:?}, expected < 1ms"
        );
    }
}
