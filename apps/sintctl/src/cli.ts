#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { buildQuery, requestJson, type CliConfig } from "./client.js";

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value) {
      continue;
    }
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const raw = value.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex > -1) {
      const key = raw.slice(0, equalsIndex);
      const val = raw.slice(equalsIndex + 1);
      flags[key] = val;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[raw] = true;
      continue;
    }

    flags[raw] = next;
    i++;
  }

  return { positionals, flags };
}

function getStringFlag(flags: Record<string, string | boolean>, key: string, required = false): string | undefined {
  const value = flags[key];
  if (typeof value === "string") return value;
  if (required) {
    throw new Error(`Missing required flag: --${key}`);
  }
  return undefined;
}

function getBooleanFlag(flags: Record<string, string | boolean>, key: string): boolean {
  const value = flags[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function parseJsonFlag<T>(flags: Record<string, string | boolean>, key: string): T | undefined {
  const value = getStringFlag(flags, key);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Invalid JSON for --${key}`);
  }
}

function printHelp(): void {
  console.log(`SINT Operator CLI (sintctl)\n
Usage:
  sintctl [global options] <group> <command> [command options]

Global options:
  --gateway <url>           Gateway URL (default: http://localhost:3100)
  --api-key <key>           Optional x-api-key for protected endpoints

Commands:
  token issue               Issue a capability token
  token revoke              Revoke a token
  approvals list            List pending approvals
  approvals resolve         Resolve a pending approval
  ledger query              Query ledger events
  intercept run             Send a policy intercept request
  keypair create            Generate keypair via gateway utility endpoint

Examples:
  sintctl token issue --issuer <pub> --subject <pub> --resource ros2:///cmd_vel --actions publish --private-key <priv>
  sintctl approvals list
  sintctl approvals resolve --request-id <id> --status approved --by operator@site
  sintctl ledger query --agent-id <pub> --limit 20
  sintctl intercept run --agent-id <pub> --token-id <id> --resource ros2:///cmd_vel --action publish --params-json '{"twist":{"linear":0.2}}'
`);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function run(): Promise<void> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));

  if (positionals.length === 0 || getBooleanFlag(flags, "help")) {
    printHelp();
    return;
  }

  const gatewayUrl = getStringFlag(flags, "gateway") ?? "http://localhost:3100";
  const apiKey = getStringFlag(flags, "api-key");
  const config: CliConfig = { gatewayUrl, apiKey };

  const [group, command] = positionals;

  if (group === "token" && command === "issue") {
    const issuer = getStringFlag(flags, "issuer", true)!;
    const subject = getStringFlag(flags, "subject", true)!;
    const resource = getStringFlag(flags, "resource", true)!;
    const actions = getStringFlag(flags, "actions", true)!
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const privateKey = getStringFlag(flags, "private-key", true)!;

    const expiresHours = Number(getStringFlag(flags, "expires-hours") ?? "12");
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

    const constraints = parseJsonFlag<Record<string, unknown>>(flags, "constraints-json") ?? {};
    const revocable = !getBooleanFlag(flags, "not-revocable");

    const payload = {
      request: {
        issuer,
        subject,
        resource,
        actions,
        constraints,
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt,
        revocable,
      },
      privateKey,
    };

    printJson(await requestJson(config, "POST", "/v1/tokens", payload));
    return;
  }

  if (group === "token" && command === "revoke") {
    const tokenId = getStringFlag(flags, "token-id", true)!;
    const reason = getStringFlag(flags, "reason", true)!;
    const revokedBy = getStringFlag(flags, "by", true)!;

    printJson(await requestJson(config, "POST", "/v1/tokens/revoke", { tokenId, reason, revokedBy }));
    return;
  }

  if (group === "approvals" && command === "list") {
    printJson(await requestJson(config, "GET", "/v1/approvals/pending"));
    return;
  }

  if (group === "approvals" && command === "resolve") {
    const requestId = getStringFlag(flags, "request-id", true)!;
    const status = getStringFlag(flags, "status", true)!;
    const by = getStringFlag(flags, "by", true)!;
    const reason = getStringFlag(flags, "reason");

    if (status !== "approved" && status !== "denied") {
      throw new Error("--status must be approved or denied");
    }

    printJson(await requestJson(config, "POST", `/v1/approvals/${requestId}/resolve`, { status, by, reason }));
    return;
  }

  if (group === "ledger" && command === "query") {
    const query = buildQuery({
      agentId: getStringFlag(flags, "agent-id"),
      eventType: getStringFlag(flags, "event-type"),
      resource: getStringFlag(flags, "resource"),
      action: getStringFlag(flags, "action"),
      tier: getStringFlag(flags, "tier"),
      from: getStringFlag(flags, "from"),
      to: getStringFlag(flags, "to"),
      limit: getStringFlag(flags, "limit"),
    });
    printJson(await requestJson(config, "GET", `/v1/ledger/query${query}`));
    return;
  }

  if (group === "intercept" && command === "run") {
    const requestId = getStringFlag(flags, "request-id") ?? randomUUID();
    const agentId = getStringFlag(flags, "agent-id", true)!;
    const tokenId = getStringFlag(flags, "token-id", true)!;
    const resource = getStringFlag(flags, "resource", true)!;
    const action = getStringFlag(flags, "action", true)!;

    const params = parseJsonFlag<Record<string, unknown>>(flags, "params-json") ?? {};
    const physicalContext = parseJsonFlag<Record<string, unknown>>(flags, "physical-context-json");
    const executionContext = parseJsonFlag<Record<string, unknown>>(flags, "execution-context-json");

    printJson(
      await requestJson(config, "POST", "/v1/intercept", {
        requestId,
        timestamp: new Date().toISOString(),
        agentId,
        tokenId,
        resource,
        action,
        params,
        physicalContext,
        executionContext,
      }),
    );
    return;
  }

  if (group === "keypair" && command === "create") {
    printJson(await requestJson(config, "POST", "/v1/keypair"));
    return;
  }

  if (group === "registry" && command === "publish") {
    const tokenFile = getStringFlag(flags, "token", true)!;
    const { readFileSync } = await import("node:fs");
    const tokenJson = readFileSync(tokenFile, "utf8");
    const token = JSON.parse(tokenJson) as unknown;
    const publisherNote = getStringFlag(flags, "note");
    printJson(await requestJson(config, "POST", "/v1/registry/publish", { token, publisherNote }));
    return;
  }

  if (group === "registry" && command === "list") {
    const issuer = getStringFlag(flags, "issuer");
    const toolScope = getStringFlag(flags, "tool-scope");
    const params = new URLSearchParams();
    if (issuer) params.set("issuer", issuer);
    if (toolScope) params.set("toolScope", toolScope);
    const qs = params.toString();
    printJson(await requestJson(config, "GET", `/v1/registry/tokens${qs ? `?${qs}` : ""}`));
    return;
  }

  printHelp();
  throw new Error(`Unknown command: ${positionals.join(" ")}`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sintctl error: ${message}`);
  process.exit(1);
});
