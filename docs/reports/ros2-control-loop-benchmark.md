# ROS2 Control-Loop Benchmark Report

## Objective

Validate that SINT gateway interception overhead for ROS2 control-loop commands meets the industrial deployment target:

- `p99 < 10ms` for `ros2:///cmd_vel` publish path.

## Latest Run

- Generated at: `2026-04-04T22:08:58.327Z`
- Iterations: `600`
- p50: `1.562ms`
- p95: `1.863ms`
- p99: `2.075ms`
- steady p99 (median of batch p99 values): `2.067ms`
- worst batch p99: `2.097ms`
- SLA target: `< 10ms`
- Result: **PASS**

## Command

`pnpm run benchmark:ros2-loop`
