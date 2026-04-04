-- SINT Protocol — expand evidence event taxonomy for v0.2 runtime paths.
-- Adds verifiable-compute and hardware safety handshake event types.

ALTER TABLE sint_evidence_ledger
  DROP CONSTRAINT IF EXISTS sint_evidence_ledger_event_type_check;

ALTER TABLE sint_evidence_ledger
  ADD CONSTRAINT sint_evidence_ledger_event_type_check
  CHECK (event_type IN (
    'agent.registered',
    'agent.capability.granted',
    'agent.capability.revoked',
    'request.received',
    'policy.evaluated',
    'approval.requested',
    'approval.granted',
    'approval.denied',
    'approval.timeout',
    'action.started',
    'action.completed',
    'action.failed',
    'action.rolledback',
    'safety.estop.triggered',
    'safety.geofence.violation',
    'safety.force.exceeded',
    'safety.human.detected',
    'safety.anomaly.detected',
    'safety.hardware.permit.denied',
    'safety.hardware.interlock.open',
    'safety.hardware.state.stale',
    'verifiable.compute.verified',
    'capsule.purchased',
    'task.bid.placed',
    'payment.settled'
  ));
