import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const watch = process.argv.includes("--watch");
const outdir = resolve("dist");

mkdirSync(outdir, { recursive: true });
cpSync(resolve("public"), outdir, { recursive: true });

const common = {
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome114",
  sourcemap: true
};

const context = await Promise.all([
  build({
    ...common,
    entryPoints: ["src/service-worker.ts"],
    outfile: "dist/service-worker.js"
  }),
  build({
    ...common,
    entryPoints: ["src/popup.ts"],
    outfile: "dist/popup.js"
  }),
  build({
    ...common,
    entryPoints: ["src/options.ts"],
    outfile: "dist/options.js"
  })
]);

if (watch) {
  console.log("Watching is not enabled in this minimal build script. Re-run build manually.");
}

void context;
