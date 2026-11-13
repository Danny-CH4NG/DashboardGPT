import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../store.ts";
import { buildServer } from "../index.ts";
import { ManifestRegistry, type Manifest } from "../manifest.ts";
// Test-only: generate the manifest the way the frontend build does. Server code never imports web/.
import { buildManifest } from "../../web/src/catalog/manifest.ts";

let app: Awaited<ReturnType<typeof buildServer>>;
let client: Client;
let manifest: ManifestRegistry;
let manifestFile: string;
let base: string;
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, data: JSON.parse((r.content as { text: string }[])[0].text) };
};
const connect = async () => {
  client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
};

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dash-"));
  manifestFile = path.join(dir, "component-manifest.json");
  await writeFile(manifestFile, JSON.stringify(buildManifest()));
  manifest = new ManifestRegistry({ file: manifestFile });
  await manifest.load();
  const store = new Store(path.join(dir, "db.json"), manifest);
  await store.init();
  app = await buildServer(store, manifest);
  await app.listen({ port: 0 });
  base = `http://localhost:${(app.server.address() as { port: number }).port}`;
  await connect();
});
afterAll(async () => {
  await client.close();
  await app.close();
});

describe("dashboard MCP (manifest-driven)", () => {
  it("lists tools and the component types from the manifest", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["list_component_types", "get_component_schema", "create_draft", "save_to_library", "apply_to_slot"]));
    const { data } = await call("list_component_types");
    expect(data.manifestVersion).toBe(manifest.version);
    expect(data.types.map((t: { type: string }) => t.type)).toContain("line");
  });

  it("publishes JSON schemas, rules and the frontend's example per type", async () => {
    const { data } = await call("get_component_schema", { type: "line" });
    expect(data.dataSchema.properties.x.type).toBe("array");
    expect(data.optionsSchema.additionalProperties).toBe(false);
    expect(data.rules).toEqual([{ kind: "sameLength", each: "series.*.values", as: "x" }]);
    expect(data.example.title).toBeTruthy();
  });

  it("enforces cross-field rules from the manifest", async () => {
    const line = await call("validate_component", {
      spec: { id: "bad-one", type: "line", title: "x", grid: { colSpan: 2, rowSpan: 2 }, data: { x: ["a", "b", "c"], series: [{ name: "s", values: [1, 2] }] } },
    });
    expect(line.data.ok).toBe(false);
    expect(line.data.errors[0].path).toBe("data.series.0.values");
    const gauge = await call("validate_component", {
      spec: { id: "bad-two", type: "gauge", title: "x", grid: { colSpan: 2, rowSpan: 2 }, data: { value: 5, min: 10, max: 10 } },
    });
    expect(gauge.data.errors[0].path).toBe("data.max");
  });

  it("rejects options a type does not declare", async () => {
    const r = await call("validate_component", {
      spec: { id: "bad-three", type: "donut", title: "x", grid: { colSpan: 2, rowSpan: 2 }, data: [{ name: "a", value: 1 }], options: { smooth: true } },
    });
    expect(r.data.errors).toEqual([{ path: "options.smooth", message: "is not an allowed property" }]);
  });

  it("drafts, saves and places a component, stamping the manifest version", async () => {
    const spec = { id: "hall-temp", type: "kpi", title: "大廳溫度", grid: { colSpan: 2, rowSpan: 1 }, data: { value: 26.5, unit: "°C" } };
    const draft = await call("create_draft", { spec });
    expect(draft.data.previewUrl).toMatch(/\/embed\/preview\//);
    const saved = await call("save_to_library", { draftId: draft.data.draftId });
    expect(saved.data.componentId).toBe("hall-temp");
    const placed = await call("apply_to_slot", { slotId: "slot-air-quality", componentId: "hall-temp" });
    expect(placed.data.slot.componentId).toBe("hall-temp");
    const stored = await (await fetch(`${base}/api/components/hall-temp`)).json();
    expect(stored.source).toMatchObject({ kind: "ai", manifestVersion: manifest.version });
  });

  it("returns isError for unknown ids", async () => {
    const r = await call("get_template", { id: "nope" });
    expect(r.isError).toBe(true);
  });

  it("picks up a component type added only on the frontend, without backend changes", async () => {
    const m = buildManifest() as Manifest;
    m.types.push({
      type: "progress",
      version: 1,
      label: "進度條",
      kind: "chart",
      fits: "Progress of one task towards 100%.",
      defaultGrid: { colSpan: 2, rowSpan: 1 },
      dataSchema: { type: "object", properties: { percent: { type: "number", minimum: 0, maximum: 100 } }, required: ["percent"], additionalProperties: false },
      optionsSchema: { type: "object", properties: {}, additionalProperties: false },
      rules: [],
      example: { title: "施工進度", data: { percent: 40 } },
    });
    m.version = "test-added-progress";
    await writeFile(manifestFile, JSON.stringify(m));
    const status = await (await fetch(`${base}/api/manifest/reload`, { method: "POST" })).json();
    expect(status.version).toBe("test-added-progress");
    await client.close();
    await connect(); // a new MCP session sees the new enum
    const types = (await call("list_component_types")).data.types.map((t: { type: string }) => t.type);
    expect(types).toContain("progress");
    const good = await call("validate_component", { spec: { id: "works-progress", type: "progress", title: "施工進度", grid: { colSpan: 2, rowSpan: 1 }, data: { percent: 40 } } });
    expect(good.data.ok).toBe(true);
    const bad = await call("validate_component", { spec: { id: "works-progress", type: "progress", title: "x", grid: { colSpan: 2, rowSpan: 1 }, data: { percent: 140 } } });
    expect(bad.data.errors[0].path).toBe("data.percent");
  });
});
