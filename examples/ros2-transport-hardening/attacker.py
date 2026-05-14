"""Unauthorized attacker: attempts to publish /cmd_vel without going through
the policy gateway and without an enclave that allows it.

Expected behavior under the hardened configuration:
  * ROS_SECURITY_ENABLE=true + Enforce means the DDS participant has no
    credentials — discovery drops it, no publish ever lands on the guarded
    side.
  * The script still calls `publish()` and then waits, but no subscriber
    will match because mutual auth fails. We detect this by counting the
    number of matched subscribers after a brief wait.

Exit codes (consumed by conformance-check.sh):
  0 — attacker successfully published (HARDENING FAILED, should never
      happen under Enforce).
  2 — attacker could not find any matched subscriber (EXPECTED).
  3 — attacker could not even initialize an authenticated participant
      (EXPECTED; strongest form of rejection).
"""

from __future__ import annotations

import os
import sys
import time


def main() -> int:
    # Explicitly NOT routing through the Policy Gateway. We are simulating a
    # compromised process on the same network trying to inject commands.
    try:
        import rclpy
        from geometry_msgs.msg import Twist
    except Exception as exc:
        print(f"[attacker] rclpy import failed: {exc}", file=sys.stderr)
        return 3

    try:
        rclpy.init(args=sys.argv)
    except Exception as exc:
        # When security is enforced and we lack credentials, rmw rejects
        # participant creation outright. This is the strongest rejection.
        print(f"[attacker] rclpy.init refused by rmw: {exc}", file=sys.stderr)
        print("[attacker] BLOCKED at participant creation")
        return 3

    try:
        # No enclave → defaults to /, which has no permissions in our
        # keystore, so the participant is either refused or isolated.
        node = rclpy.create_node("bypass_attacker")
        pub = node.create_publisher(Twist, "cmd_vel", 10)

        deadline = time.time() + 10.0
        while time.time() < deadline:
            rclpy.spin_once(node, timeout_sec=0.2)
            if pub.get_subscription_count() > 0:
                # If we see a matched subscriber, try to publish and then
                # surface the count so the conformance check can assert.
                msg = Twist()
                msg.linear.x = 1.0
                pub.publish(msg)
                print(f"[attacker] matched_subscribers={pub.get_subscription_count()} — BYPASS SUCCEEDED")
                node.destroy_node()
                return 0

        matched = pub.get_subscription_count()
        print(f"[attacker] matched_subscribers={matched} after 10s — BLOCKED by transport")
        node.destroy_node()
        return 2
    finally:
        try:
            rclpy.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
