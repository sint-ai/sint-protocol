/**
 * esbuild bundle script for @sint/mcp-scanner.
 * Produces self-contained dist/cli.js and dist/scanner.js with all
 * workspace dependencies inlined — no external @sint/* deps at runtime.
 */
import * as esbuild from "esbuild";
import * as fs from "fs";

// CLI bundle — self-contained for `npx sint-scan`
// esbuild preserves the shebang from src/cli.ts automatically
await esbuild.build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/cli.js",
});

// Ensure exactly one shebang at the top (deduplicate if both banner and source shebang land)
let cliContent = fs.readFileSync("dist/cli.js", "utf8");
cliContent = cliContent.replace(/^(#!.*\n)+/, "#!/usr/bin/env node\n");
fs.writeFileSync("dist/cli.js", cliContent);
// npm requires bin scripts to be executable
fs.chmodSync("dist/cli.js", 0o755);

// Library bundle — self-contained for programmatic import
await esbuild.build({
  entryPoints: ["src/scanner.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/scanner.js",
});

console.log("esbuild bundle complete");
