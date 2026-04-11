#[cfg(test)]
mod tests {
    use sint_client::types::*;
    use sint_client::{RetryConfig, SintRequestBuilder};

    // ── Original 3 tests ─────────────────────────────────────────────────────

    #[test]
    fn test_approval_tier_serialization() {
        let tier = ApprovalTier::T2Act;
        let json = serde_json::to_string(&tier).expect("serialization failed");
        assert_eq!(json, "\"T2_act\"");

        let roundtrip: ApprovalTier =
            serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(roundtrip, ApprovalTier::T2Act);

        assert_eq!(
            serde_json::to_string(&ApprovalTier::T0Observe).unwrap(),
            "\"T0_observe\""
        );
        assert_eq!(
            serde_json::to_string(&ApprovalTier::T1Prepare).unwrap(),
            "\"T1_prepare\""
        );
        assert_eq!(
            serde_json::to_string(&ApprovalTier::T3Commit).unwrap(),
            "\"T3_commit\""
        );
    }

    #[test]
    fn test_decision_action_roundtrip() {
        for action in [
            DecisionAction::Allow,
            DecisionAction::Deny,
            DecisionAction::Escalate,
        ] {
            let json = serde_json::to_string(&action).expect("serialization failed");
            let roundtrip: DecisionAction =
                serde_json::from_str(&json).expect("deserialization failed");
            assert_eq!(roundtrip, action);
        }

        assert_eq!(
            serde_json::to_string(&DecisionAction::Allow).unwrap(),
            "\"allow\""
        );
        assert_eq!(
            serde_json::to_string(&DecisionAction::Deny).unwrap(),
            "\"deny\""
        );
        assert_eq!(
            serde_json::to_string(&DecisionAction::Escalate).unwrap(),
            "\"escalate\""
        );
    }

    #[test]
    fn test_sint_request_serialization() {
        let req = SintRequest {
            request_id: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7".to_string(),
            timestamp: "2026-04-05T10:00:00.000000Z".to_string(),
            agent_id: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
                .to_string(),
            token_id: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8".to_string(),
            resource: "ros2:///cmd_vel".to_string(),
            action: "publish".to_string(),
            params: None,
            physical_context: None,
        };

        let json = serde_json::to_string(&req).expect("serialization failed");
        let parsed: serde_json::Value =
            serde_json::from_str(&json).expect("parse failed");

        assert!(parsed.get("requestId").is_some());
        assert!(parsed.get("agentId").is_some());
        assert!(parsed.get("tokenId").is_some());
        assert_eq!(parsed["resource"], "ros2:///cmd_vel");
        assert_eq!(parsed["action"], "publish");
        assert!(parsed.get("params").is_none());
    }

    // ── Builder tests ─────────────────────────────────────────────────────────

    #[test]
    fn test_builder_builds_valid_request() {
        let req = SintRequestBuilder::new()
            .agent_id("agent-key-hex")
            .token_id("token-uuid")
            .resource("mcp://filesystem/readFile")
            .action("call")
            .build()
            .expect("build should succeed");

        assert_eq!(req.agent_id, "agent-key-hex");
        assert_eq!(req.token_id, "token-uuid");
        assert_eq!(req.resource, "mcp://filesystem/readFile");
        assert_eq!(req.action, "call");
        assert!(!req.request_id.is_empty());
        assert!(!req.timestamp.is_empty());
    }

    #[test]
    fn test_builder_auto_generates_request_id() {
        let req1 = SintRequestBuilder::new()
            .agent_id("a")
            .token_id("t")
            .resource("r")
            .action("act")
            .build()
            .unwrap();

        let req2 = SintRequestBuilder::new()
            .agent_id("a")
            .token_id("t")
            .resource("r")
            .action("act")
            .build()
            .unwrap();

        // Two calls must produce distinct IDs.
        assert_ne!(req1.request_id, req2.request_id);
    }

    #[test]
    fn test_builder_auto_generates_timestamp() {
        let req = SintRequestBuilder::new()
            .agent_id("a")
            .token_id("t")
            .resource("r")
            .action("act")
            .build()
            .unwrap();

        // Basic ISO 8601 shape: "YYYY-MM-DDTHH:MM:SS.ffffffZ"
        assert!(req.timestamp.contains('T'), "timestamp should contain 'T'");
        assert!(req.timestamp.ends_with('Z'), "timestamp should end with 'Z'");
        assert!(req.timestamp.len() >= 20, "timestamp seems too short");
    }

    #[test]
    fn test_builder_missing_required_field_errors() {
        // Missing agent_id
        let result = SintRequestBuilder::new()
            .token_id("t")
            .resource("r")
            .action("act")
            .build();
        assert!(result.is_err(), "should fail without agent_id");

        // Missing token_id
        let result = SintRequestBuilder::new()
            .agent_id("a")
            .resource("r")
            .action("act")
            .build();
        assert!(result.is_err(), "should fail without token_id");

        // Missing resource
        let result = SintRequestBuilder::new()
            .agent_id("a")
            .token_id("t")
            .action("act")
            .build();
        assert!(result.is_err(), "should fail without resource");

        // Missing action
        let result = SintRequestBuilder::new()
            .agent_id("a")
            .token_id("t")
            .resource("r")
            .build();
        assert!(result.is_err(), "should fail without action");
    }

    #[test]
    fn test_builder_with_physical_context() {
        let ctx = PhysicalContext {
            human_detected: Some(true),
            current_velocity_mps: Some(0.5),
            current_force_newtons: None,
            obstacle_distance_m: Some(1.2),
        };

        let req = SintRequestBuilder::new()
            .agent_id("a")
            .token_id("t")
            .resource("ros2:///cmd_vel")
            .action("publish")
            .physical_context(ctx)
            .build()
            .unwrap();

        let json =
            serde_json::to_string(&req).expect("serialization failed");
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        let pc = parsed.get("physicalContext").expect("physicalContext missing");
        assert_eq!(pc["humanDetected"], true);
        assert_eq!(pc["currentVelocityMps"], 0.5);
        assert!(pc.get("currentForceNewtons").is_none(), "None field should be omitted");
        assert_eq!(pc["obstacleDistanceM"], 1.2);
    }

    #[test]
    fn test_builder_default() {
        // Default trait should compile and behave identically to new().
        let result = SintRequestBuilder::default()
            .agent_id("a")
            .token_id("t")
            .resource("r")
            .action("act")
            .build();
        assert!(result.is_ok());
    }

    // ── PhysicalContext tests ─────────────────────────────────────────────────

    #[test]
    fn test_physical_context_omits_none_fields() {
        let ctx = PhysicalContext {
            human_detected: None,
            current_velocity_mps: None,
            current_force_newtons: None,
            obstacle_distance_m: None,
        };

        let json = serde_json::to_string(&ctx).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed.get("humanDetected").is_none());
        assert!(parsed.get("currentVelocityMps").is_none());
        assert!(parsed.get("currentForceNewtons").is_none());
        assert!(parsed.get("obstacleDistanceM").is_none());
        // All-None struct serializes to "{}"
        assert_eq!(json, "{}");
    }

    #[test]
    fn test_physical_context_serializes_all_fields() {
        let ctx = PhysicalContext {
            human_detected: Some(false),
            current_velocity_mps: Some(1.5),
            current_force_newtons: Some(200.0),
            obstacle_distance_m: Some(0.3),
        };

        let json = serde_json::to_string(&ctx).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["humanDetected"], false);
        assert_eq!(parsed["currentVelocityMps"], 1.5);
        assert_eq!(parsed["currentForceNewtons"], 200.0);
        assert_eq!(parsed["obstacleDistanceM"], 0.3);
    }

    // ── LedgerQuery tests ─────────────────────────────────────────────────────

    #[test]
    fn test_ledger_query_default() {
        let q = LedgerQuery::default();
        assert!(q.agent_id.is_none());
        assert!(q.event_type.is_none());
        assert!(q.resource.is_none());
        assert!(q.limit.is_none());
    }

    // ── Retry tests ───────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_retry_succeeds_on_first_try() {
        use sint_client::retry::{with_retry, RetryConfig};
        let config = RetryConfig::default();
        let result = with_retry(&config, || async { Ok::<i32, &str>(42) }).await;
        assert_eq!(result, Ok(42));
    }

    #[tokio::test]
    async fn test_retry_exhausts_all_attempts() {
        use sint_client::retry::{with_retry, RetryConfig};
        let config = RetryConfig {
            max_attempts: 3,
            initial_delay_ms: 1,
            max_delay_ms: 10,
            backoff_multiplier: 2.0,
        };

        let mut calls = 0u32;
        let result = with_retry(&config, || {
            calls += 1;
            async { Err::<i32, &str>("always fails") }
        })
        .await;

        assert!(result.is_err());
        assert_eq!(calls, 3);
    }

    #[test]
    fn test_retry_config_default() {
        let cfg = RetryConfig::default();
        assert_eq!(cfg.max_attempts, 3);
        assert!(cfg.initial_delay_ms > 0);
        assert!(cfg.max_delay_ms >= cfg.initial_delay_ms);
        assert!(cfg.backoff_multiplier > 1.0);
    }

    #[tokio::test]
    async fn test_retry_succeeds_after_failure() {
        use sint_client::retry::{with_retry, RetryConfig};
        use std::sync::{Arc, Mutex};

        let config = RetryConfig {
            max_attempts: 3,
            initial_delay_ms: 1,
            max_delay_ms: 10,
            backoff_multiplier: 2.0,
        };

        let attempt = Arc::new(Mutex::new(0u32));
        let attempt_clone = Arc::clone(&attempt);

        let result = with_retry(&config, || {
            let a = Arc::clone(&attempt_clone);
            async move {
                let mut count = a.lock().unwrap();
                *count += 1;
                if *count < 2 {
                    Err("not yet")
                } else {
                    Ok(99i32)
                }
            }
        })
        .await;

        assert_eq!(result, Ok(99));
        assert_eq!(*attempt.lock().unwrap(), 2);
    }

    // ── Type round-trip tests ─────────────────────────────────────────────────

    #[test]
    fn test_revocation_request_serialization() {
        let req = TokenRevocationRequest {
            token_id: "tok-123".to_string(),
            reason: "compromised".to_string(),
            revoked_by: "admin".to_string(),
        };

        let json = serde_json::to_string(&req).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        // camelCase on the wire
        assert!(parsed.get("tokenId").is_some());
        assert!(parsed.get("revokedBy").is_some());
        assert_eq!(parsed["reason"], "compromised");
    }

    #[test]
    fn test_ledger_event_deserialization() {
        let json = r#"{
            "eventId": "evt-001",
            "eventType": "intercept",
            "agentId": "agent-hex",
            "resource": "ros2:///cmd_vel",
            "action": "publish",
            "decision": "allow",
            "tier": "T0_observe",
            "timestamp": "2026-04-10T12:00:00.000000Z"
        }"#;

        let event: LedgerEvent = serde_json::from_str(json).expect("deserialization failed");
        assert_eq!(event.event_id, "evt-001");
        assert_eq!(event.event_type, "intercept");
        assert_eq!(event.agent_id, "agent-hex");
        assert_eq!(event.decision, "allow");

        // Round-trip
        let re_serialized = serde_json::to_string(&event).unwrap();
        let reparsed: serde_json::Value = serde_json::from_str(&re_serialized).unwrap();
        assert_eq!(reparsed["eventId"], "evt-001");
    }
}
