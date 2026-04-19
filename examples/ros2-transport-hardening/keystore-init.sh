#!/usr/bin/env bash
# Build an SROS2 keystore with enclaves for the hardened demo.
#
# The keystore is a directory of X.509 material that DDS participants use for
# mutual authentication and per-topic access control. When a node starts with
# ROS_SECURITY_ENABLE=true and ROS_SECURITY_STRATEGY=Enforce, rmw refuses to
# join the domain unless its enclave matches.
#
# Enclaves created here:
#   /guarded_talker    — allowed to publish /cmd_vel
#   /guarded_camera    — allowed to subscribe /camera/front
#
# The attacker container has NO enclave, so DDS Secure rejects its
# discovery announcements and any publish attempt is dropped at the
# transport layer — proving bypass is not possible at the app layer alone.

set -euo pipefail

KEYSTORE="${KEYSTORE:-/keystore}"

if [[ -f "${KEYSTORE}/public/ca.cert.pem" ]]; then
  echo "[keystore] already initialized at ${KEYSTORE}"
  exit 0
fi

source /opt/ros/humble/setup.bash

echo "[keystore] creating ${KEYSTORE}"
ros2 security create_keystore "${KEYSTORE}"

# Enclaves. Each gets its own identity cert + permissions.xml.
ros2 security create_enclave "${KEYSTORE}" /guarded_talker
ros2 security create_enclave "${KEYSTORE}" /guarded_camera

# Overlay custom permissions: restrict each enclave to its declared topic.
cat > "${KEYSTORE}/enclaves/guarded_talker/permissions.xml" <<'PERM'
<?xml version="1.0" encoding="UTF-8"?>
<permissions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:noNamespaceSchemaLocation="http://www.omg.org/spec/DDS-SECURITY/20170901/omg_shared_ca_permissions.xsd">
  <grant name="/guarded_talker">
    <subject_name>CN=/guarded_talker</subject_name>
    <validity>
      <not_before>2026-01-01T00:00:00</not_before>
      <not_after>2030-01-01T00:00:00</not_after>
    </validity>
    <allow_rule>
      <domains><id>0</id></domains>
      <publish>
        <topics><topic>rt/cmd_vel</topic></topics>
      </publish>
      <subscribe>
        <topics><topic>rq/*</topic><topic>rr/*</topic></topics>
      </subscribe>
    </allow_rule>
    <default>DENY</default>
  </grant>
</permissions>
PERM

cat > "${KEYSTORE}/enclaves/guarded_camera/permissions.xml" <<'PERM'
<?xml version="1.0" encoding="UTF-8"?>
<permissions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:noNamespaceSchemaLocation="http://www.omg.org/spec/DDS-SECURITY/20170901/omg_shared_ca_permissions.xsd">
  <grant name="/guarded_camera">
    <subject_name>CN=/guarded_camera</subject_name>
    <validity>
      <not_before>2026-01-01T00:00:00</not_before>
      <not_after>2030-01-01T00:00:00</not_after>
    </validity>
    <allow_rule>
      <domains><id>0</id></domains>
      <subscribe>
        <topics><topic>rt/camera/front</topic></topics>
      </subscribe>
    </allow_rule>
    <default>DENY</default>
  </grant>
</permissions>
PERM

# Re-sign permissions with the CA so rmw accepts the overlay.
for enclave in guarded_talker guarded_camera; do
  openssl smime -sign \
    -in "${KEYSTORE}/enclaves/${enclave}/permissions.xml" \
    -text -out "${KEYSTORE}/enclaves/${enclave}/permissions.p7s" \
    -signer "${KEYSTORE}/public/permissions_ca.cert.pem" \
    -inkey "${KEYSTORE}/private/permissions_ca.key.pem"
done

echo "[keystore] enclaves signed; ready at ${KEYSTORE}"
