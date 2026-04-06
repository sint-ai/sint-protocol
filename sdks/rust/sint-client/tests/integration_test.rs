#[cfg(test)]
mod tests {
    use sint_client::types::*;

    #[test]
    fn test_approval_tier_serialization() {
        let tier = ApprovalTier::T2Act;
        let json = serde_json::to_string(&tier).expect("serialization failed");
        assert_eq!(json, "\"T2_act\"");

        let roundtrip: ApprovalTier = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(roundtrip, ApprovalTier::T2Act);

        // Check all tier values serialize to their canonical string forms
        assert_eq!(serde_json::to_string(&ApprovalTier::T0Observe).unwrap(), "\"T0_observe\"");
        assert_eq!(serde_json::to_string(&ApprovalTier::T1Prepare).unwrap(), "\"T1_prepare\"");
        assert_eq!(serde_json::to_string(&ApprovalTier::T3Commit).unwrap(), "\"T3_commit\"");
    }

    #[test]
    fn test_decision_action_roundtrip() {
        for action in [DecisionAction::Allow, DecisionAction::Deny, DecisionAction::Escalate] {
            let json = serde_json::to_string(&action).expect("serialization failed");
            let roundtrip: DecisionAction =
                serde_json::from_str(&json).expect("deserialization failed");
            assert_eq!(roundtrip, action);
        }

        // Verify exact wire format
        assert_eq!(serde_json::to_string(&DecisionAction::Allow).unwrap(), "\"allow\"");
        assert_eq!(serde_json::to_string(&DecisionAction::Deny).unwrap(), "\"deny\"");
        assert_eq!(serde_json::to_string(&DecisionAction::Escalate).unwrap(), "\"escalate\"");
    }

    #[test]
    fn test_sint_request_serialization() {
        let req = SintRequest {
            request_id: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7".to_string(),
            timestamp: "2026-04-05T10:00:00.000000Z".to_string(),
            agent_id: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2".to_string(),
            token_id: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8".to_string(),
            resource: "ros2:///cmd_vel".to_string(),
            action: "publish".to_string(),
            params: None,
        };

        let json = serde_json::to_string(&req).expect("serialization failed");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse failed");

        // Verify camelCase field names on the wire
        assert!(parsed.get("requestId").is_some());
        assert!(parsed.get("agentId").is_some());
        assert!(parsed.get("tokenId").is_some());
        assert_eq!(parsed["resource"], "ros2:///cmd_vel");
        assert_eq!(parsed["action"], "publish");

        // params: None should be omitted (skip_serializing_if)
        assert!(parsed.get("params").is_none());
    }
}
