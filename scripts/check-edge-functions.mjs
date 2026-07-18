import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve("supabase/functions");
const entries = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => resolve(root, entry.name, "index.ts"));

for (const entryPoint of entries) {
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "neutral",
    format: "esm",
    external: ["https://*"],
    write: false,
    logLevel: "warning",
  });
}

console.log(`Validated ${entries.length} Supabase Edge Function bundles.`);
