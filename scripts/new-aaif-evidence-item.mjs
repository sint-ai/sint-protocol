#!/usr/bin/env node

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedTypes = new Set(["production-adopter", "maintainer", "release", "conformance", "security"]);

function usage() {
  console.error("usage: pnpm run aaif:evidence:new <type> <slug> [YYYY-MM-DD]");
  console.error("types: production-adopter | maintainer | release | conformance | security");
}

const type = process.argv[2];
const slug = process.argv[3];
const date = process.argv[4] ?? new Date().toISOString().slice(0, 10);

if (!type || !slug) {
  usage();
  process.exit(1);
}

if (!allowedTypes.has(type)) {
  console.error(`[aaif-evidence] unsupported type: ${type}`);
  usage();
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("[aaif-evidence] date must be YYYY-MM-DD");
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error("[aaif-evidence] slug must be lowercase kebab-case");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const evidenceDir = path.join(repoRoot, "docs", "community", "aaif-evidence");
const targetName = `${date}-${type}-${slug}.md`;
const targetPath = path.join(evidenceDir, targetName);
const indexPath = path.join(repoRoot, "docs", "community", "aaif-evidence-dossier.md");

if (existsSync(targetPath)) {
  console.error(`[aaif-evidence] file already exists: ${targetName}`);
  process.exit(1);
}

mkdirSync(evidenceDir, { recursive: true });

const template = `# AAIF Evidence Item: ${slug}

- Type: ${type}
- Organization:
- Independent from current co-design network: yes/no
- Public URL:
- Date range: ${date} to
- SINT component used:
- Verification method:
- Contact or accountable owner:

## Notes

- TBD
`;

writeFileSync(targetPath, template, "utf8");

if (existsSync(indexPath)) {
  const marker = "| _Add next entry_ | _type_ | _organization_ | _owner_ | _link_ |";
  const relPath = `./aaif-evidence/${targetName}`;
  const row = `| ${date} | ${type} | TBD | TBD | [${targetName}](${relPath}) |`;
  const content = readFileSync(indexPath, "utf8");
  if (content.includes(marker)) {
    writeFileSync(indexPath, content.replace(marker, `${row}\n${marker}`), "utf8");
  }
}

console.log(`[aaif-evidence] created ${path.relative(repoRoot, targetPath)}`);
