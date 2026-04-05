import * as esbuild from "esbuild";
import * as fs from "node:fs";

await esbuild.build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.js",
});

let cliContent = fs.readFileSync("dist/cli.js", "utf8");
cliContent = cliContent.replace(/^(#!.*\n)+/, "#!/usr/bin/env node\n");
fs.writeFileSync("dist/cli.js", cliContent);
fs.chmodSync("dist/cli.js", 0o755);

console.log("esbuild bundle complete");
