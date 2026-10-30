import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const listed = JSON.parse(
  execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
    cwd: root,
    encoding: "utf8",
  }),
);

const normalize = (path) => path.replaceAll("\\", "/");
const workspaces = listed.filter((entry) => resolve(entry.path) !== root);
const packageProjects = workspaces.filter((entry) =>
  normalize(entry.path).includes("/packages/"),
);
const bridges = packageProjects.filter((entry) =>
  normalize(entry.path).includes("/packages/bridge-"),
);

const expected = {
  "pnpm workspace projects": workspaces.length,
  "packages under `packages/`": packageProjects.length,
  "protocol bridge packages": bridges.length,
};
const facts = readFileSync(resolve(root, "docs/project-facts.md"), "utf8");

for (const [label, count] of Object.entries(expected)) {
  const row = new RegExp(`\\| ${label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[^\\n]*\\| ${count} \\|`);
  if (!row.test(facts)) {
    throw new Error(`docs/project-facts.md has a stale ${label} count; expected ${count}`);
  }
}

if (bridges.some((entry) => !entry.name?.includes("bridge-"))) {
  throw new Error("Bridge inventory includes a package without a bridge-* name");
}

console.log(
  `Public facts verified: ${workspaces.length} workspaces, ${packageProjects.length} packages, ${bridges.length} bridges.`,
);
