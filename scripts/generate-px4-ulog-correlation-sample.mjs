#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const fixturePath = path.join(
  repoRoot,
  "packages",
  "conformance-tests",
  "fixtures",
  "physical-ai",
  "px4-ulog-correlation-artifact.v1.json",
);
const outputPath = path.join(
  repoRoot,
  "docs",
  "reports",
  "px4-ulog-correlation-artifact.sample.json",
);

mkdirSync(path.dirname(outputPath), { recursive: true });

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
if (!fixture?.sample || typeof fixture.sample !== "object") {
  throw new Error("Fixture is missing required `sample` object.");
}

writeFileSync(outputPath, JSON.stringify(fixture.sample, null, 2) + "\n", "utf8");
console.log(`[px4-ulog] wrote ${path.relative(repoRoot, outputPath)}`);
