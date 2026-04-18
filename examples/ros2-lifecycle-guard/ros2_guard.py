import json
import os
import secrets
import time
import urllib.error
import urllib.request


def iso8601_utc_micro() -> str:
    # `YYYY-MM-DDTHH:MM:SS.ffffffZ`
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time_ns() % 1_000_000_000 / 1_000):06d}Z"


def uuid_v7() -> str:
    # Minimal UUIDv7 generator (48-bit unix_ms, version=7, variant=RFC4122).
    unix_ms = int(time.time() * 1000)
    rand_a = secrets.randbits(12)
    rand_b = secrets.token_bytes(8)

    time_high = unix_ms & 0xFFFFFFFFFFFF
    a = (time_high << 16) | (0x7000 | rand_a)
    b0 = (rand_b[0] & 0x3F) | 0x80  # variant 10xxxxxx
    b = bytes([b0]) + rand_b[1:]
    hex_a = f"{a:016x}"
    hex_b = b.hex()
    return f"{hex_a[0:8]}-{hex_a[8:12]}-{hex_a[12:16]}-{hex_b[0:4]}-{hex_b[4:16]}"


def http_json(method: str, url: str, payload: dict | None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def try_intercept(gateway_url: str, request_body: dict) -> dict:
    try:
        return http_json("POST", f"{gateway_url}/v1/intercept", request_body)
    except Exception as exc:
        # Fail-closed default for demo: if the gate is down, refuse to execute.
        return {
            "action": "deny",
            "assignedTier": "T3_COMMIT",
            "denial": {"reason": f"gateway_unreachable: {type(exc).__name__}"},
        }


def main() -> None:
    gateway_url = os.environ.get("SINT_GATEWAY_URL", "http://localhost:3100").rstrip("/")

    # Create issuer + agent keypairs via dev utility route.
    root = http_json("POST", f"{gateway_url}/v1/keypair", {})
    agent = http_json("POST", f"{gateway_url}/v1/keypair", {})

    expires_at = iso8601_utc_micro()
    # Extend expiry ~2h.
    expires_at = time.strftime(
        "%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() + 2 * 3600)
    ) + f".{int(time.time_ns() % 1_000_000_000 / 1_000):06d}Z"

    # Issue two tokens:
    # - camera subscribe (T0 allow path)
    # - cmd_vel publish (T2/T3 control path)
    camera_token = http_json(
        "POST",
        f"{gateway_url}/v1/tokens",
        {
            "request": {
                "issuer": root["publicKey"],
                "subject": agent["publicKey"],
                "resource": "ros2:///camera/front",
                "actions": ["subscribe"],
                "constraints": {},
                "delegationChain": {"parentTokenId": None, "depth": 0, "attenuated": False},
                "expiresAt": expires_at,
                "revocable": True,
            },
            "privateKey": root["privateKey"],
        },
    )

    cmd_vel_token = http_json(
        "POST",
        f"{gateway_url}/v1/tokens",
        {
            "request": {
                "issuer": root["publicKey"],
                "subject": agent["publicKey"],
                "resource": "ros2:///cmd_vel",
                "actions": ["publish"],
                "constraints": {"maxVelocityMps": 0.2},
                "delegationChain": {"parentTokenId": None, "depth": 0, "attenuated": False},
                "expiresAt": expires_at,
                "revocable": True,
            },
            "privateKey": root["privateKey"],
        },
    )

    # 1) Allow: read-like subscribe.
    allow_decision = try_intercept(
        gateway_url,
        {
            "requestId": uuid_v7(),
            "timestamp": iso8601_utc_micro(),
            "agentId": agent["publicKey"],
            "tokenId": camera_token["tokenId"],
            "resource": "ros2:///camera/front",
            "action": "subscribe",
            "params": {"qos": "sensor_data"},
        },
    )
    print("[ALLOW path]", allow_decision.get("action"), allow_decision.get("assignedTier"))

    # 2) Escalate: cmd_vel publish (safe velocity).
    esc_decision = try_intercept(
        gateway_url,
        {
            "requestId": uuid_v7(),
            "timestamp": iso8601_utc_micro(),
            "agentId": agent["publicKey"],
            "tokenId": cmd_vel_token["tokenId"],
            "resource": "ros2:///cmd_vel",
            "action": "publish",
            "params": {"linear": {"x": 0.1}, "angular": {"z": 0.05}},
            "physicalContext": {"currentVelocityMps": 0.1, "humanDetected": False},
        },
    )
    print("[ESCALATE path]", esc_decision.get("action"), esc_decision.get("assignedTier"))

    # 3) Deny: cmd_vel publish exceeds maxVelocityMps.
    deny_decision = try_intercept(
        gateway_url,
        {
            "requestId": uuid_v7(),
            "timestamp": iso8601_utc_micro(),
            "agentId": agent["publicKey"],
            "tokenId": cmd_vel_token["tokenId"],
            "resource": "ros2:///cmd_vel",
            "action": "publish",
            "params": {"linear": {"x": 1.0}, "angular": {"z": 0.05}},
            "physicalContext": {"currentVelocityMps": 1.0, "humanDetected": False},
        },
    )
    print("[DENY path]", deny_decision.get("action"), deny_decision.get("assignedTier"))

    # 4) Fail-closed: attempt interception against a bogus host.
    fail_closed = try_intercept(
        "http://gateway.invalid:1",
        {
            "requestId": uuid_v7(),
            "timestamp": iso8601_utc_micro(),
            "agentId": agent["publicKey"],
            "tokenId": camera_token["tokenId"],
            "resource": "ros2:///camera/front",
            "action": "subscribe",
            "params": {},
        },
    )
    print("[FAIL-CLOSED path]", fail_closed.get("action"), fail_closed.get("assignedTier"))


if __name__ == "__main__":
    main()

