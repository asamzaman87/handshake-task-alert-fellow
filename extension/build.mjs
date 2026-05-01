import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvOptional() {
  const p = resolve(".env");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadDotEnvOptional();

const watch = process.argv.includes("--watch");
const outdir = resolve("dist");

function normalizeBackendBase(raw) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "http://127.0.0.1:8787";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

/** Base URL wired into service worker — set EXTENSION_BACKEND_URL when building for production */
const backendBase = normalizeBackendBase(
  process.env.EXTENSION_BACKEND_URL ?? "https://handshake-task-alert-fellow.vercel.app"
);
const backendOrigin = new URL(backendBase).origin;

mkdirSync(outdir, { recursive: true });
cpSync(resolve("public"), outdir, { recursive: true });

const manifestPath = resolve(outdir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = [`${backendOrigin}/*`];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.info(`extension build: EXTENSION_BACKEND_BASE -> ${backendBase}`);

const common = {
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome114",
  sourcemap: true,
  define: {
    __EXTENSION_BACKEND_BASE__: JSON.stringify(backendBase)
  }
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
  })
]);

if (watch) {
  console.log("Watching is not enabled in this minimal build script. Re-run build manually.");
}

void context;
