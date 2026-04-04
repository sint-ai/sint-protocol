/**
 * SROS2 (Secure ROS2) enclave discovery and SINT policy bridge.
 *
 * SROS2 uses a keystore directory structure:
 *   $SROS2_KEYSTORE/
 *     enclaves/
 *       <domain_id>/
 *         <enclave_path>/
 *           identity_ca.cert.pem
 *           cert.pem
 *           key.pem
 *           permissions.xml     ← DDS access control
 *           governance.xml      ← topic encryption/auth settings
 *
 * We parse permissions.xml to extract allow/deny rules and map them
 * to SINT capability token constraints.
 */

import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";

export interface Sros2Enclave {
  readonly enclavePath: string;
  readonly domainId: number;
  readonly allowPublish: string[];   // topic name patterns
  readonly allowSubscribe: string[]; // topic name patterns
  readonly denyPublish: string[];
  readonly denySubscribe: string[];
  readonly governanceEnforced: boolean;
}

export interface Sros2Discovery {
  readonly keystoreRoot: string;
  readonly enclaves: Sros2Enclave[];
  readonly discoveredAt: string;
}

/**
 * Parse topic patterns from permissions.xml using regex.
 * Extracts allow/deny publish/subscribe rules without an XML library.
 */
function parsePermissionsXml(xml: string): {
  allowPublish: string[];
  allowSubscribe: string[];
  denyPublish: string[];
  denySubscribe: string[];
} {
  const allowPublish: string[] = [];
  const allowSubscribe: string[] = [];
  const denyPublish: string[] = [];
  const denySubscribe: string[] = [];

  // Match <allow_rule> ... </allow_rule> blocks
  const allowRuleRegex = /<allow_rule[\s\S]*?<\/allow_rule>/g;
  // Match <deny_rule> ... </deny_rule> blocks
  const denyRuleRegex = /<deny_rule[\s\S]*?<\/deny_rule>/g;

  const topicPattern = /<topics>([\s\S]*?)<\/topics>/g;
  const topicValueRegex = /<topic>([\s\S]*?)<\/topic>/g;

  function extractTopics(block: string): string[] {
    const topics: string[] = [];
    const topicsBlockMatch = topicPattern.exec(block);
    if (topicsBlockMatch) {
      const topicsBlock = topicsBlockMatch[1] ?? "";
      let m: RegExpExecArray | null;
      topicValueRegex.lastIndex = 0;
      while ((m = topicValueRegex.exec(topicsBlock)) !== null) {
        const topic = (m[1] ?? "").trim();
        if (topic) topics.push(topic);
      }
    }
    return topics;
  }

  function extractPublishTopics(block: string): string[] {
    const pubMatch = /<publish>([\s\S]*?)<\/publish>/g.exec(block);
    if (!pubMatch) return [];
    topicPattern.lastIndex = 0;
    return extractTopics(pubMatch[1] ?? "");
  }

  function extractSubscribeTopics(block: string): string[] {
    const subMatch = /<subscribe>([\s\S]*?)<\/subscribe>/g.exec(block);
    if (!subMatch) return [];
    topicPattern.lastIndex = 0;
    return extractTopics(subMatch[1] ?? "");
  }

  let m: RegExpExecArray | null;

  allowRuleRegex.lastIndex = 0;
  while ((m = allowRuleRegex.exec(xml)) !== null) {
    const block = m[0] ?? "";
    allowPublish.push(...extractPublishTopics(block));
    allowSubscribe.push(...extractSubscribeTopics(block));
  }

  denyRuleRegex.lastIndex = 0;
  while ((m = denyRuleRegex.exec(xml)) !== null) {
    const block = m[0] ?? "";
    denyPublish.push(...extractPublishTopics(block));
    denySubscribe.push(...extractSubscribeTopics(block));
  }

  return { allowPublish, allowSubscribe, denyPublish, denySubscribe };
}

/**
 * Check whether a governance.xml enforces security policies.
 */
function parseGovernanceXml(xml: string): boolean {
  // If governance.xml contains any <enable_*_protection>TRUE</enable_*_protection>
  return /<enable_\w+_protection\s*>\s*TRUE\s*<\/enable_\w+_protection>/i.test(xml);
}

/**
 * Recursively walk enclaves/<domainId>/<enclave_path>/ directories
 * and collect enclave definitions.
 */
async function walkEnclaveDir(
  enclavesRoot: string,
  domainId: number,
  relPath: string,
  absPath: string,
  results: Sros2Enclave[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(absPath, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
    return;
  }

  const fileNames = entries.filter((e) => e.isFile()).map((e) => String(e.name));
  const hasPermissions = fileNames.includes("permissions.xml");

  if (hasPermissions) {
    let xml = "";
    try {
      xml = await readFile(join(absPath, "permissions.xml"), "utf8");
    } catch {
      xml = "";
    }

    let governanceEnforced = false;
    const hasGovernance = fileNames.includes("governance.xml");
    if (hasGovernance) {
      try {
        const govXml = await readFile(join(absPath, "governance.xml"), "utf8");
        governanceEnforced = parseGovernanceXml(govXml);
      } catch {
        governanceEnforced = false;
      }
    }

    const { allowPublish, allowSubscribe, denyPublish, denySubscribe } =
      parsePermissionsXml(xml);

    results.push({
      enclavePath: relPath || "/",
      domainId,
      allowPublish,
      allowSubscribe,
      denyPublish,
      denySubscribe,
      governanceEnforced,
    });
  }

  // Recurse into subdirectories
  const subdirs = entries.filter((e) => e.isDirectory());
  for (const subdir of subdirs) {
    const subdirName = String(subdir.name);
    const newRel = relPath ? `${relPath}/${subdirName}` : subdirName;
    await walkEnclaveDir(
      enclavesRoot,
      domainId,
      newRel,
      join(absPath, subdirName),
      results,
    );
  }
}

/**
 * Discover SROS2 enclaves from the keystore directory.
 * Reads $SROS2_SECURITY_KEYSTORE env var, falls back to keystoreRoot param.
 * Returns empty discovery if keystore not found (fail-open).
 */
export async function discoverSros2Enclaves(
  keystoreRoot?: string,
): Promise<Sros2Discovery> {
  const root =
    process.env["SROS2_SECURITY_KEYSTORE"] ?? keystoreRoot ?? "";

  const discoveredAt = new Date().toISOString();

  if (!root) {
    return { keystoreRoot: root, enclaves: [], discoveredAt };
  }

  // Check keystore exists
  try {
    await access(root);
  } catch {
    return { keystoreRoot: root, enclaves: [], discoveredAt };
  }

  const enclavesPath = join(root, "enclaves");
  let domainEntries: Dirent[];
  try {
    domainEntries = await readdir(enclavesPath, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
    return { keystoreRoot: root, enclaves: [], discoveredAt };
  }

  const enclaves: Sros2Enclave[] = [];

  for (const domainEntry of domainEntries) {
    if (!domainEntry.isDirectory()) continue;
    const domainName = String(domainEntry.name);
    const domainId = parseInt(domainName, 10);
    if (isNaN(domainId)) continue;

    const domainPath = join(enclavesPath, domainName);
    await walkEnclaveDir(enclavesPath, domainId, "", domainPath, enclaves);
  }

  return { keystoreRoot: root, enclaves, discoveredAt };
}

/**
 * Match a topic name against an SROS2 pattern.
 * Supports wildcard `*` which matches any single path segment,
 * and `**` which matches any number of path segments.
 */
export function matchTopicPattern(pattern: string, topicName: string): boolean {
  // Normalize: strip trailing slash
  const p = pattern.replace(/\/$/, "");
  const t = topicName.replace(/\/$/, "");

  if (p === t) return true;
  if (!p.includes("*")) return false;

  // Convert pattern to regex:
  // ** → matches anything (including slashes)
  // *  → matches any single segment (no slashes)
  const escaped = p
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]+"),
    )
    .join(".*");

  const regex = new RegExp(`^${escaped}$`);
  return regex.test(t);
}

/**
 * Check if a ROS2 publish/subscribe is permitted by SROS2 enclave rules.
 * Returns "not-covered" if no rule matches (fail-open).
 */
export function checkSros2Permission(
  enclave: Sros2Enclave,
  topicName: string,
  operation: "publish" | "subscribe",
): "allow" | "deny" | "not-covered" {
  const allowList =
    operation === "publish" ? enclave.allowPublish : enclave.allowSubscribe;
  const denyList =
    operation === "publish" ? enclave.denyPublish : enclave.denySubscribe;

  // Deny rules take precedence
  for (const pattern of denyList) {
    if (matchTopicPattern(pattern, topicName)) return "deny";
  }

  for (const pattern of allowList) {
    if (matchTopicPattern(pattern, topicName)) return "allow";
  }

  return "not-covered";
}

/**
 * Map SROS2 enclave permissions to SINT token constraints.
 * The resulting constraints can be used as additional token-level restrictions.
 */
export function sros2ToSintConstraints(enclave: Sros2Enclave): {
  allowedTopics: string[];
  deniedTopics: string[];
} {
  const allowedTopics = [
    ...new Set([...enclave.allowPublish, ...enclave.allowSubscribe]),
  ];
  const deniedTopics = [
    ...new Set([...enclave.denyPublish, ...enclave.denySubscribe]),
  ];

  return { allowedTopics, deniedTopics };
}
