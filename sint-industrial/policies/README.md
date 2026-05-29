# Policies

The industrial pack starts from `docs/specs/industrial-policy.yaml`.

The policy model is deliberately boring:

- deny when simulation proof is missing
- deny when the safety zone is not clear
- deny when requested force or velocity exceeds the approved envelope
- require human approval for physical T2/T3 actions
- carry a hash-linked receipt chain into operator review

Adapters may add vendor-specific metadata, but they do not make authorization
decisions.
