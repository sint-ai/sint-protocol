import * as esbuild from "esbuild";
import * as fs from "node:fs";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "dist/index.cjs",
});

let cliContent = fs.readFileSync("dist/index.cjs", "utf8");
cliContent = cliContent.replace(/^(#!.*\n)+/, "#!/usr/bin/env node\n");
fs.writeFileSync("dist/index.cjs", cliContent);
fs.chmodSync("dist/index.cjs", 0o755);

await esbuild.build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "dist/server.cjs",
});

console.log("esbuild bundle complete");
