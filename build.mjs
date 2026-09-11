import { build } from "esbuild";

await build({
  entryPoints: ["src/plugin.js"],
  outfile: "com.telynor.foundry-integration.sdPlugin/bin/plugin.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false
});
