#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const outputArg = process.argv.indexOf("--output");
const output = resolve(
  root,
  outputArg >= 0 && process.argv[outputArg + 1]
    ? process.argv[outputArg + 1]
    : "artifacts/sbom.spdx.json",
);

const files = execFileSync(
  "git",
  ["ls-files", "package.json", "packages/*/package.json", "apps/*/package.json", "capsules/*/package.json", "sdks/typescript/package.json"],
  { cwd: root, encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();

const packages = [];
for (const file of files) {
  const manifest = JSON.parse(await readFile(resolve(root, file), "utf8"));
  if (!manifest.name) continue;
  packages.push({
    SPDXID: `SPDXRef-Package-${packages.length + 1}`,
    name: manifest.name,
    versionInfo: manifest.version ?? "NOASSERTION",
    downloadLocation: manifest.repository?.url ?? "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: manifest.license ?? "NOASSERTION",
    licenseDeclared: manifest.license ?? "NOASSERTION",
    supplier: "Organization: SINT AI",
    externalRefs: [{
      referenceCategory: "PACKAGE-MANAGER",
      referenceType: "purl",
      referenceLocator: `pkg:npm/${encodeURIComponent(manifest.name)}@${manifest.version ?? "0.0.0"}`,
    }],
    comment: `Workspace manifest: ${file}`,
  });
}

const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const namespaceSeed = createHash("sha256")
  .update(`${revision}\n${packages.map((entry) => `${entry.name}@${entry.versionInfo}`).join("\n")}`)
  .digest("hex");
const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "sint-protocol-workspace",
  documentNamespace: `https://sint.ai/sbom/${namespaceSeed}`,
  creationInfo: {
    created: new Date().toISOString(),
    creators: ["Tool: scripts/generate-spdx-sbom.mjs"],
  },
  documentDescribes: packages.map((entry) => entry.SPDXID),
  packages,
  annotations: [{
    annotationType: "OTHER",
    annotator: "Tool: scripts/generate-spdx-sbom.mjs",
    annotationDate: new Date().toISOString(),
    comment: `Generated from git revision ${revision}; output ${relative(root, output)}`,
  }],
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${packages.length} workspace packages to ${output}`);
