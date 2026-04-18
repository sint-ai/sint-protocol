FROM ros:humble-ros-base

SHELL ["/bin/bash", "-lc"]

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /demo
COPY ros2_guard.py /demo/ros2_guard.py

