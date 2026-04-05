import { describe, expect, it } from "vitest";
import { buildQuery } from "../src/client.js";

describe("buildQuery", () => {
  it("encodes only defined params", () => {
    const query = buildQuery({
      agentId: "agent-1",
      action: undefined,
      resource: "ros2:///cmd_vel",
      limit: "20",
    });

    expect(query).toContain("agentId=agent-1");
    expect(query).toContain("resource=ros2%3A%2F%2F%2Fcmd_vel");
    expect(query).toContain("limit=20");
    expect(query).not.toContain("action=");
  });
});
