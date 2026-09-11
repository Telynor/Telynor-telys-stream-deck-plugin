import { build } from "esbuild";

await build({
  entryPoints: ["src/plugin.js"],
  outfile: "com.telynor.foundry-integration.sdPlugin/bin/plugin.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true
});
