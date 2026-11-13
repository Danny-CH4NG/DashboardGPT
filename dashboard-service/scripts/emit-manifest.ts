/**
 * Writes component-manifest.json without a full build, e.g. for CI to upload
 * it next to the frontend:  npx tsx scripts/emit-manifest.ts [outFile]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildManifest } from "../web/src/catalog/manifest.ts";

const out = path.resolve(process.argv[2] ?? "public/component-manifest.json");
await mkdir(path.dirname(out), { recursive: true });
const m = buildManifest();
await writeFile(out, JSON.stringify(m, null, 2));
console.log(`component manifest ${m.version} (${m.types.length} types) → ${out}`);
