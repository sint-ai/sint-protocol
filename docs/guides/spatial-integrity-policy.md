# Spatial Integrity Policy

SINT's spatial integrity policy turns degraded localization from a demo-time
assumption into a deployment-time gate. It is intended for physical AI rollouts
where GPS, connectivity, perception, or map freshness cannot be treated as
ambient guarantees.

The policy is opt-in through `PolicyGatewayConfig.spatialIntegrityPolicy`. It
runs after token validation and before normal tier assignment, so it can stop or
escalate physical actions before a bridge reaches ROS 2, MAVLink, Open-RMF, OPC
UA, or humanoid/robot control surfaces.

## Default Profiles

`DefaultSpatialIntegrityPolicy` includes three deployment profiles:

| Profile | Use case | Default behavior |
|---|---|---|
| `gps-denied-indoor` | Warehouses, facilities, public-safety interiors | Requires pose, frame, fresh localization, confidence >= 0.7; escalates below 0.9 |
| `underground-inspection` | Tunnels, mines, basements, utility corridors | Requires pose, frame, fresh localization, confidence >= 0.75; escalates below 0.92 |
| `contested-airspace` | Degraded GNSS or adversarial RF environments | Requires pose, frame, fresh localization, confidence >= 0.8; escalates below 0.95 |

Observe-only actions such as sensor subscriptions are not blocked by these
profiles. The policy applies to physical actions such as velocity commands,
joint commands, gripper/end-effector calls, MAVLink/PX4 commands, Open-RMF
actions, and industrial control resources.

## Example

```ts
import {
  DefaultSpatialIntegrityPolicy,
  PolicyGateway,
} from "@pshkv/gate-policy-gateway";

const gateway = new PolicyGateway({
  resolveToken,
  spatialIntegrityPolicy: new DefaultSpatialIntegrityPolicy(),
});
```

A GPS-denied physical request should carry localization evidence:

```ts
{
  executionContext: {
    deploymentProfile: "gps-denied-indoor"
  },
  physicalContext: {
    currentPosition: { x: 12.4, y: 3.1, z: 0 },
    frameId: "map:warehouse-a:v17",
    localizationConfidence: 0.94,
    localizationObservedAt: "2026-07-31T09:30:00.000000Z"
  }
}
```

## Decision Model

- Missing required position or frame evidence: deny.
- Missing or stale `localizationObservedAt`: deny.
- Confidence below `minLocalizationConfidence`: deny.
- Confidence below `minAutonomousLocalizationConfidence`: escalate to T2 human review.
- Fresh high-confidence evidence: continue through normal SINT tiering and token constraints.

Token `executionEnvelope` spatial proof remains the stricter per-token control.
Use this deployment policy when an entire site profile should fail closed even
if a token was issued without explicit spatial proof requirements.
