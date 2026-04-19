"""Guarded talker: policy-gated /cmd_vel publisher with SROS2 enclave.

Two layers of defense:

1. Application: every publish is preceded by `PolicyGateway.intercept()`.
2. Transport: the node runs under a dedicated SROS2 enclave
   (`/guarded_talker`) whose permissions.xml only allows it to publish
   `rt/cmd_vel`. DDS Secure rejects anything else at the network layer.

A container without the keystore mounted — or with a different enclave —
cannot complete DDS authenticated discovery and its publish attempts are
dropped before any ROS code runs on the guarded side.
"""

from __future__ import annotations

import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from typing import Any


def iso8601_utc_micro() -> str:
    return (
        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        + f".{int(time.time_ns() % 1_000_000_000 / 1_000):06d}Z"
    )


def uuid_v7() -> str:
    unix_ms = int(time.time() * 1000)
    rand_a = secrets.randbits(12)
    rand_b = secrets.token_bytes(8)
    time_high = unix_ms & 0xFFFFFFFFFFFF
    a = (time_high << 16) | (0x7000 | rand_a)
    b0 = (rand_b[0] & 0x3F) | 0x80
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


def intercept(gateway_url: str, body: dict) -> dict:
    try:
        return http_json("POST", f"{gateway_url}/v1/intercept", body)
    except Exception as exc:
        return {
            "action": "deny",
            "assignedTier": "T3_COMMIT",
            "denial": {"reason": f"gateway_unreachable: {type(exc).__name__}"},
        }


def issue_cmd_vel_token(gateway_url: str) -> tuple[dict, dict]:
    root = http_json("POST", f"{gateway_url}/v1/keypair", {})
    agent = http_json("POST", f"{gateway_url}/v1/keypair", {})
    expires_at = time.strftime(
        "%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() + 2 * 3600)
    ) + f".{int(time.time_ns() % 1_000_000_000 / 1_000):06d}Z"
    token = http_json(
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
    return agent, token


def publish_via_ros2(value_x: float, enclave: str) -> None:
    """Publish a single Twist message under the given SROS2 enclave."""
    import rclpy
    from geometry_msgs.msg import Twist

    rclpy.init(args=sys.argv)
    try:
        node = rclpy.create_node("guarded_talker", enclave=enclave)
        pub = node.create_publisher(Twist, "cmd_vel", 10)
        msg = Twist()
        msg.linear.x = value_x
        # Publish a handful of times to ensure matching via discovery.
        for _ in range(5):
            pub.publish(msg)
            rclpy.spin_once(node, timeout_sec=0.1)
        node.destroy_node()
    finally:
        rclpy.shutdown()


def require_security_env() -> str:
    enclave = os.environ.get("ROS_SECURITY_ENCLAVE_OVERRIDE", "/guarded_talker")
    if os.environ.get("ROS_SECURITY_ENABLE", "").lower() != "true":
        raise RuntimeError("ROS_SECURITY_ENABLE must be 'true' for this demo")
    if os.environ.get("ROS_SECURITY_STRATEGY", "") != "Enforce":
        raise RuntimeError("ROS_SECURITY_STRATEGY must be 'Enforce'")
    keystore = os.environ.get("ROS_SECURITY_KEYSTORE", "")
    if not keystore or not os.path.isdir(keystore):
        raise RuntimeError(f"ROS_SECURITY_KEYSTORE must point to an initialized keystore, got: {keystore!r}")
    return enclave


def main() -> None:
    gateway_url = os.environ.get("SINT_GATEWAY_URL", "http://localhost:3100").rstrip("/")
    enclave = require_security_env()

    agent, token = issue_cmd_vel_token(gateway_url)

    decision = intercept(
        gateway_url,
        {
            "requestId": uuid_v7(),
            "timestamp": iso8601_utc_micro(),
            "agentId": agent["publicKey"],
            "tokenId": token["tokenId"],
            "resource": "ros2:///cmd_vel",
            "action": "publish",
            "params": {"linear": {"x": 0.1}, "angular": {"z": 0.0}},
            "physicalContext": {"currentVelocityMps": 0.1, "humanDetected": False},
        },
    )
    print(f"[guarded_talker] policy decision: {decision.get('action')} ({decision.get('assignedTier')})")

    if decision.get("action") in {"allow", "escalate"}:
        publish_via_ros2(0.1, enclave)
        print("[guarded_talker] published cmd_vel under enclave", enclave)
    else:
        print("[guarded_talker] refused to publish: policy denied")

    # Sentinel line that the conformance script greps for:
    print("[guarded_talker] OK")


if __name__ == "__main__":
    main()
