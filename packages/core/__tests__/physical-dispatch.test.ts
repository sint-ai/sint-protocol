import { describe, expect, it } from "vitest";
import { classifyPhysicalDispatch } from "../src/constants/physical-dispatch.js";

describe("classifyPhysicalDispatch", () => {
  it("keeps a ROS 2 sensor subscribe as observe and a command as actuate", () => {
    expect(classifyPhysicalDispatch({
      resource: "ros2:///camera/front",
      action: "subscribe",
    }).dispatchClass).toBe("observe");
    expect(classifyPhysicalDispatch({
      resource: "ros2:///cmd_vel",
      action: "publish",
    })).toMatchObject({
      dispatchClass: "actuate",
      reason: "Physical command transport requires ACT tier",
    });
  });

  it("keeps an explicit plan publish as prepare", () => {
    expect(classifyPhysicalDispatch({
      resource: "ros2:///plan",
      action: "publish",
    }).dispatchClass).toBe("prepare");
  });

  it("treats a VLA chunk on a generic tool as actuating", () => {
    expect(classifyPhysicalDispatch({
      resource: "mcp://server/tool",
      action: "call",
      executionContext: { vlaActionChunk: { chunkId: "chunk-1" } },
    })).toMatchObject({ dispatchClass: "actuate", protocol: "vla" });
  });

  it("floors a named MCP robot tool and leaves a generic tool unclassified", () => {
    expect(classifyPhysicalDispatch({
      resource: "mcp://arm/move_gripper",
      action: "call",
    }).dispatchClass).toBe("actuate");
    expect(classifyPhysicalDispatch({
      resource: "mcp://arm/move_gripper",
      action: "call",
      mcpAnnotations: { readOnlyHint: true },
    })).toMatchObject({
      dispatchClass: "actuate",
      reason: "MCP robot tool requires ACT tier",
    });
    expect(classifyPhysicalDispatch({
      resource: "mcp://server/tool",
      action: "call",
    }).dispatchClass).toBe("unclassified");
  });

  it("classifies Home Assistant and direct HTTP actuator commands", () => {
    expect(classifyPhysicalDispatch({
      resource: "ha://home/lock.front_door",
      action: "call",
    }).dispatchClass).toBe("actuate");
    expect(classifyPhysicalDispatch({
      resource: "ha://home/sensor.temperature",
      action: "call",
    }).dispatchClass).toBe("unclassified");
    expect(classifyPhysicalDispatch({
      resource: "https://cell.local/cmd/valve",
      action: "post",
    }).dispatchClass).toBe("actuate");
  });
});
