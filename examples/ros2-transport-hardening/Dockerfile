FROM ros:humble-ros-base

SHELL ["/bin/bash", "-lc"]

# SROS2 tooling lives in ros-humble-sros2; openssl is used by keystore-init.sh
# to re-sign custom permissions.xml overlays.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       python3 \
       python3-colcon-common-extensions \
       ros-humble-sros2 \
       ros-humble-geometry-msgs \
       openssl \
       ca-certificates \
       curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /demo
COPY keystore-init.sh guarded_talker.py attacker.py ./
RUN chmod +x keystore-init.sh

# Default to Fast DDS with security plugins enabled (rmw_fastrtps_cpp is
# shipped with ros:humble-ros-base).
ENV RMW_IMPLEMENTATION=rmw_fastrtps_cpp
