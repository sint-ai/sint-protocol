/**
 * SINT Bridge-ROS2 — Resource Mapper unit tests.
 */

import { describe, it, expect } from "vitest";
import {
  topicToResourceUri,
  gazeboTopicToResourceUri,
  isaacTopicToResourceUri,
  differentialDriveTopicToResourceUri,
  serviceToResourceUri,
  actionToResourceUri,
  extractPhysicalContext,
} from "../src/ros2-resource-mapper.js";
import {
  extractPhysicalContextFromTwist,
  extractPhysicalContextFromWrench,
  extractPhysicalContextFromDifferentialWheelCommand,
} from "../src/ros2-message-types.js";
import type { ROS2TopicMessage } from "../src/types.js";

describe("topicToResourceUri", () => {
  it("maps /cmd_vel to ros2:///cmd_vel", () => {
    expect(topicToResourceUri("/cmd_vel")).toBe("ros2:///cmd_vel");
  });

  it("maps /camera/front to ros2:///camera/front", () => {
    expect(topicToResourceUri("/camera/front")).toBe("ros2:///camera/front");
  });

  it("handles topic without leading slash", () => {
    expect(topicToResourceUri("sensor/lidar")).toBe("ros2:///sensor/lidar");
  });

  it("normalizes Gazebo model-scoped cmd_vel when enabled", () => {
    expect(topicToResourceUri("/model/amr_17/cmd_vel", { gazeboNormalize: true }))
      .toBe("ros2:///cmd_vel");
  });

  it("keeps Gazebo model-scoped topic unchanged by default", () => {
    expect(topicToResourceUri("/model/amr_17/cmd_vel"))
      .toBe("ros2:///model/amr_17/cmd_vel");
  });

  it("normalizes Isaac namespaced cmd_vel when enabled", () => {
    expect(topicToResourceUri("/isaac/ur10/cmd_vel", { isaacNormalize: true }))
      .toBe("ros2:///cmd_vel");
  });

  it("normalizes namespaced differential-drive topics when enabled", () => {
    expect(
      topicToResourceUri("/robot/cmd_wheels", {
        differentialDriveNormalize: true,
      }),
    ).toBe("ros2:///cmd_wheels");
  });
});

describe("gazeboTopicToResourceUri", () => {
  it("maps Gazebo cmd_vel topic to canonical ROS2 cmd_vel resource", () => {
    expect(gazeboTopicToResourceUri("/model/warehouse_bot/cmd_vel")).toBe(
      "ros2:///cmd_vel",
    );
  });

  it("maps Gazebo world/model joint command topic to canonical resource", () => {
    expect(
      gazeboTopicToResourceUri("/world/demo/model/arm_1/joint_commands"),
    ).toBe("ros2:///joint_commands");
  });
});

describe("isaacTopicToResourceUri", () => {
  it("maps Isaac namespaced cmd_vel to canonical resource", () => {
    expect(isaacTopicToResourceUri("/isaac/warehouse_bot/cmd_vel")).toBe(
      "ros2:///cmd_vel",
    );
  });

  it("maps Isaac namespaced joint command topic to canonical resource", () => {
    expect(isaacTopicToResourceUri("/robots/cell_bot_01/joint_commands")).toBe(
      "ros2:///joint_commands",
    );
  });
});

describe("differentialDriveTopicToResourceUri", () => {
  it("maps namespaced wheel command topic to canonical resource", () => {
    expect(differentialDriveTopicToResourceUri("/robot/cmd_wheels")).toBe(
      "ros2:///cmd_wheels",
    );
  });

  it("maps namespaced wheel encoder topic to canonical resource", () => {
    expect(differentialDriveTopicToResourceUri("/robot/enc_wheels")).toBe(
      "ros2:///enc_wheels",
    );
  });
});

describe("serviceToResourceUri", () => {
  it("maps /mode_change to ros2:///mode_change", () => {
    expect(serviceToResourceUri("/mode_change")).toBe("ros2:///mode_change");
  });
});

describe("actionToResourceUri", () => {
  it("maps /navigate_to_pose to ros2:///navigate_to_pose", () => {
    expect(actionToResourceUri("/navigate_to_pose")).toBe("ros2:///navigate_to_pose");
  });
});

describe("extractPhysicalContextFromTwist", () => {
  it("computes velocity magnitude from Twist", () => {
    const twist = {
      linear: { x: 0.3, y: 0.4, z: 0 },
      angular: { x: 0, y: 0, z: 0.1 },
    };
    const ctx = extractPhysicalContextFromTwist(twist);
    expect(ctx.velocityMps).toBeCloseTo(0.5, 5);
  });

  it("estimates force from velocity and mass", () => {
    const twist = {
      linear: { x: 1.0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    };
    const ctx = extractPhysicalContextFromTwist(twist, 25);
    expect(ctx.forceNewtons).toBeCloseTo(25, 5);
  });

  it("returns undefined force when mass not provided", () => {
    const twist = {
      linear: { x: 1.0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    };
    const ctx = extractPhysicalContextFromTwist(twist);
    expect(ctx.forceNewtons).toBeUndefined();
  });
});

describe("extractPhysicalContextFromWrench", () => {
  it("computes force magnitude from Wrench", () => {
    const wrench = {
      force: { x: 3, y: 4, z: 0 },
      torque: { x: 0, y: 0, z: 1 },
    };
    const ctx = extractPhysicalContextFromWrench(wrench);
    expect(ctx.forceNewtons).toBeCloseTo(5, 5);
  });
});

describe("extractPhysicalContextFromDifferentialWheelCommand", () => {
  it("computes a conservative linear speed bound from wheel speeds", () => {
    const command = {
      param: [6, 4] as [number, number],
    };
    const ctx = extractPhysicalContextFromDifferentialWheelCommand(command, {
      wheelRadiusM: 0.1,
      robotMassKg: 20,
    });
    expect(ctx.wheelVelocityRadPerSecMax).toBe(6);
    expect(ctx.velocityMps).toBeCloseTo(0.6, 5);
    expect(ctx.forceNewtons).toBeCloseTo(12, 5);
  });
});

describe("extractPhysicalContext", () => {
  it("extracts velocity from Twist message", () => {
    const message: ROS2TopicMessage = {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 0.5, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: new Date().toISOString(),
    };

    const ctx = extractPhysicalContext(message);
    expect(ctx).toBeDefined();
    expect(ctx!.currentVelocityMps).toBeCloseTo(0.5, 5);
  });

  it("extracts force from Wrench message", () => {
    const message: ROS2TopicMessage = {
      topicName: "/force_torque",
      messageType: "geometry_msgs/Wrench",
      data: {
        force: { x: 10, y: 0, z: 0 },
        torque: { x: 0, y: 0, z: 0 },
      },
      timestamp: new Date().toISOString(),
    };

    const ctx = extractPhysicalContext(message);
    expect(ctx).toBeDefined();
    expect(ctx!.currentForceNewtons).toBeCloseTo(10, 5);
  });

  it("extracts velocity from namespaced differential-drive wheel commands", () => {
    const message: ROS2TopicMessage = {
      topicName: "/robot/cmd_wheels",
      messageType: "common/msg/Wheels",
      data: {
        header: { frame_id: "robot_7" },
        param: [5, 4],
      },
      timestamp: new Date().toISOString(),
    };

    const ctx = extractPhysicalContext(message, {
      robotMassKg: 20,
      differentialDriveWheelRadiusM: 0.1,
    });
    expect(ctx).toBeDefined();
    expect(ctx!.currentVelocityMps).toBeCloseTo(0.5, 5);
    expect(ctx!.currentForceNewtons).toBeCloseTo(10, 5);
  });

  it("does not treat wheel telemetry as actuation context", () => {
    const message: ROS2TopicMessage = {
      topicName: "/robot/enc_wheels",
      messageType: "common/msg/Wheels",
      data: {
        header: { frame_id: "robot_7" },
        param: [5, 4],
      },
      timestamp: new Date().toISOString(),
    };

    const ctx = extractPhysicalContext(message, {
      robotMassKg: 20,
      differentialDriveWheelRadiusM: 0.1,
    });
    expect(ctx).toBeUndefined();
  });

  it("returns undefined for unrecognized message types", () => {
    const message: ROS2TopicMessage = {
      topicName: "/status",
      messageType: "std_msgs/String",
      data: { data: "hello" },
      timestamp: new Date().toISOString(),
    };

    const ctx = extractPhysicalContext(message);
    expect(ctx).toBeUndefined();
  });
});
