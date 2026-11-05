/**
 * ROS 2 control-tick shield.
 *
 * A device tick does not consult a simulator and does not authorize.
 * A linear command whose speed is above the token velocity bound is not published.
 * A yaw command whose rate is above the token angular bound is not published.
 */

export interface Ros2CmdVelTick {
  readonly linearXMps: number;
  readonly maxVelocityMps: number;
  readonly angularZRps?: number;
  readonly maxAngularVelocityRps?: number;
}

export interface Ros2TickPublisher {
  publish(linearXMps: number): void;
}

export function publishRos2CmdVelTick(
  tick: Ros2CmdVelTick,
  publisher: Ros2TickPublisher,
): { readonly published: boolean } {
  if (Math.abs(tick.linearXMps) > tick.maxVelocityMps) {
    return { published: false };
  }
  if (
    tick.angularZRps !== undefined
    && tick.maxAngularVelocityRps !== undefined
    && Math.abs(tick.angularZRps) > tick.maxAngularVelocityRps
  ) {
    return { published: false };
  }
  publisher.publish(tick.linearXMps);
  return { published: true };
}
