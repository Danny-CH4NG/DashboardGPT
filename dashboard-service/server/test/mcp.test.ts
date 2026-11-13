import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../store.ts";
import { buildServer } from "../index.ts";

let app: Awaited<ReturnType<typeof buildServer>>;
let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, data: JSON.parse((r.content as { text: string }[])[0].text) };
};

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dash-"));
  const store = new Store(path.join(dir, "db.json"));
  await store.init();
  app = await buildServer(store);
  await app.listen({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`)));
});
afterAll(async () => {
  await client.close();
  await app.close();
});

describe("dashboard MCP", () => {
  it("lists tools and component types", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["list_component_types", "get_component_schema", "create_draft", "save_to_library", "apply_to_slot"]));
    const { data } = await call("list_component_types");
    expect(data.types.map((t: { type: string }) => t.type)).toContain("line");
  });

  it("publishes a JSON schema and example per type", async () => {
    const { data } = await call("get_component_schema", { type: "line" });
    expect(data.dataSchema.properties.x.type).toBe("array");
    expect(data.example.type).toBe("line");
  });

  it("reports readable validation errors", async () => {
    const { data } = await call("validate_component", {
      spec: { id: "bad-one", type: "line", title: "x", grid: { colSpan: 2, rowSpan: 2 }, data: { x: ["a", "b", "c"], series: [{ name: "s", values: [1, 2] }] } },
    });
    expect(data.ok).toBe(false);
    expect(data.errors[0].path).toBe("data.series.0.values");
  });

  it("drafts, saves and places a component", async () => {
    const spec = { id: "hall-temp", type: "kpi", title: "大廳溫度", grid: { colSpan: 2, rowSpan: 1 }, data: { value: 26.5, unit: "°C" } };
    const draft = await call("create_draft", { spec });
    expect(draft.data.previewUrl).toMatch(/\/embed\/preview\//);
    const saved = await call("save_to_library", { draftId: draft.data.draftId });
    expect(saved.data.componentId).toBe("hall-temp");
    const placed = await call("apply_to_slot", { slotId: "slot-air-quality", componentId: "hall-temp" });
    expect(placed.data.slot.componentId).toBe("hall-temp");
    const tpl = await call("list_templates");
    expect(tpl.data.templates.find((t: { id: string }) => t.id === "hall-temp").source).toBe("ai");
  });

  it("returns isError for unknown ids", async () => {
    const r = await call("get_template", { id: "nope" });
    expect(r.isError).toBe(true);
  });
});
