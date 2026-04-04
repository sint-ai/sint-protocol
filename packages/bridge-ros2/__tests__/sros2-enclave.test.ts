/**
 * SROS2 enclave discovery and SINT policy bridge — unit tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverSros2Enclaves,
  checkSros2Permission,
  sros2ToSintConstraints,
  matchTopicPattern,
} from "../src/sros2-enclave.js";
import type { Sros2Enclave } from "../src/sros2-enclave.js";

// Minimal valid permissions.xml with allow/deny rules
const PERMISSIONS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<permissions>
  <grant name="talker_grant">
    <subject_name>CN=talker</subject_name>
    <validity>
      <not_before>2026-01-01T00:00:00</not_before>
      <not_after>2027-01-01T00:00:00</not_after>
    </validity>
    <allow_rule>
      <domains><id>0</id></domains>
      <publish>
        <topics>
          <topic>/chatter</topic>
          <topic>/sensor/*</topic>
        </topics>
      </publish>
      <subscribe>
        <topics>
          <topic>/status</topic>
        </topics>
      </subscribe>
    </allow_rule>
    <deny_rule>
      <domains><id>0</id></domains>
      <publish>
        <topics>
          <topic>/restricted</topic>
        </topics>
      </publish>
      <subscribe>
        <topics>
          <topic>/secret</topic>
        </topics>
      </subscribe>
    </deny_rule>
  </grant>
</permissions>`;

let tmpDir: string;
let savedEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "sros2-test-"));
  savedEnv = process.env["SROS2_SECURITY_KEYSTORE"];
  delete process.env["SROS2_SECURITY_KEYSTORE"];
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  if (savedEnv !== undefined) {
    process.env["SROS2_SECURITY_KEYSTORE"] = savedEnv;
  } else {
    delete process.env["SROS2_SECURITY_KEYSTORE"];
  }
});

async function buildKeystore(root: string): Promise<void> {
  const enclavePath = join(root, "enclaves", "0", "talker");
  await mkdir(enclavePath, { recursive: true });
  await writeFile(join(enclavePath, "permissions.xml"), PERMISSIONS_XML, "utf8");
}

describe("discoverSros2Enclaves", () => {
  it("returns empty discovery when keystore not found", async () => {
    const result = await discoverSros2Enclaves("/nonexistent/path/to/keystore");
    expect(result.enclaves).toHaveLength(0);
    expect(result.keystoreRoot).toBe("/nonexistent/path/to/keystore");
    expect(result.discoveredAt).toBeTruthy();
  });

  it("reads SROS2_SECURITY_KEYSTORE env var", async () => {
    await buildKeystore(tmpDir);
    process.env["SROS2_SECURITY_KEYSTORE"] = tmpDir;

    const result = await discoverSros2Enclaves("/some/other/path");
    // Should use the env var, not the param
    expect(result.keystoreRoot).toBe(tmpDir);
    expect(result.enclaves.length).toBeGreaterThanOrEqual(1);
  });

  it("discovers enclave with parsed permissions", async () => {
    await buildKeystore(tmpDir);

    const result = await discoverSros2Enclaves(tmpDir);
    expect(result.enclaves).toHaveLength(1);
    const enc = result.enclaves[0]!;
    expect(enc.domainId).toBe(0);
    expect(enc.allowPublish).toContain("/chatter");
    expect(enc.allowPublish).toContain("/sensor/*");
    expect(enc.allowSubscribe).toContain("/status");
    expect(enc.denyPublish).toContain("/restricted");
    expect(enc.denySubscribe).toContain("/secret");
  });
});

describe("checkSros2Permission", () => {
  const enclave: Sros2Enclave = {
    enclavePath: "/talker",
    domainId: 0,
    allowPublish: ["/chatter", "/sensor/*"],
    allowSubscribe: ["/status"],
    denyPublish: ["/restricted"],
    denySubscribe: ["/secret"],
    governanceEnforced: false,
  };

  it("returns allow when topic matches allowPublish pattern", () => {
    expect(checkSros2Permission(enclave, "/chatter", "publish")).toBe("allow");
  });

  it("returns deny when topic matches denyPublish pattern", () => {
    expect(checkSros2Permission(enclave, "/restricted", "publish")).toBe("deny");
  });

  it("returns not-covered when no rule matches", () => {
    expect(checkSros2Permission(enclave, "/unknown/topic", "publish")).toBe(
      "not-covered",
    );
  });

  it("fail-open: no enclave for topic → not-covered (do not deny)", () => {
    const emptyEnclave: Sros2Enclave = {
      enclavePath: "/empty",
      domainId: 0,
      allowPublish: [],
      allowSubscribe: [],
      denyPublish: [],
      denySubscribe: [],
      governanceEnforced: false,
    };
    const result = checkSros2Permission(emptyEnclave, "/any/topic", "publish");
    expect(result).toBe("not-covered");
    // Crucially must NOT be "deny"
    expect(result).not.toBe("deny");
  });
});

describe("wildcard pattern matching", () => {
  it("wildcard: /sensor/* matches /sensor/lidar", () => {
    expect(matchTopicPattern("/sensor/*", "/sensor/lidar")).toBe(true);
  });

  it("wildcard: /sensor/* does not match /sensor/lidar/data", () => {
    expect(matchTopicPattern("/sensor/*", "/sensor/lidar/data")).toBe(false);
  });

  it("wildcard: /robot/** matches /robot/arm/joint1", () => {
    expect(matchTopicPattern("/robot/**", "/robot/arm/joint1")).toBe(true);
  });

  it("exact match works without wildcards", () => {
    expect(matchTopicPattern("/chatter", "/chatter")).toBe(true);
    expect(matchTopicPattern("/chatter", "/other")).toBe(false);
  });
});

describe("sros2ToSintConstraints", () => {
  it("extracts allowed and denied topics from enclave", () => {
    const enclave: Sros2Enclave = {
      enclavePath: "/talker",
      domainId: 0,
      allowPublish: ["/chatter"],
      allowSubscribe: ["/status"],
      denyPublish: ["/restricted"],
      denySubscribe: ["/secret"],
      governanceEnforced: false,
    };

    const constraints = sros2ToSintConstraints(enclave);
    expect(constraints.allowedTopics).toContain("/chatter");
    expect(constraints.allowedTopics).toContain("/status");
    expect(constraints.deniedTopics).toContain("/restricted");
    expect(constraints.deniedTopics).toContain("/secret");
  });

  it("deduplicates topics that appear in both publish and subscribe lists", () => {
    const enclave: Sros2Enclave = {
      enclavePath: "/node",
      domainId: 0,
      allowPublish: ["/shared"],
      allowSubscribe: ["/shared"],
      denyPublish: [],
      denySubscribe: [],
      governanceEnforced: false,
    };

    const constraints = sros2ToSintConstraints(enclave);
    expect(constraints.allowedTopics.filter((t) => t === "/shared")).toHaveLength(1);
  });
});
