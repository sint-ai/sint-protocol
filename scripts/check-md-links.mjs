#!/usr/bin/env node
/**
 * Relative-link checker for Markdown files.
 * Usage: node scripts/check-md-links.mjs [root=.]
 * Reports links of the form [text](path) or [text](path#anchor) whose target
 * file does not exist. External URLs, mailto:, and pure anchors are ignored.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vitepress", ".turbo", "coverage"]);
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (entry.endsWith(".md")) files.push(full);
  }
})(root);

const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
let broken = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  let m;
  while ((m = linkRe.exec(text))) {
    let target = m[1];
    if (/^(https?:|mailto:|#|tel:|data:)/i.test(target)) continue;
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    target = target.split("#")[0].split("?")[0];
    if (!target) continue;
    const abs = target.startsWith("/") ? join(root, target) : resolve(dirname(file), target);
    if (!existsSync(abs) && !existsSync(abs + ".md")) {
      broken++;
      console.log(`${relative(root, file)}: ${m[1]}`);
    }
  }
}
console.log(`\n${files.length} markdown files scanned, ${broken} broken relative links`);
process.exit(broken > 0 ? 1 : 0);
