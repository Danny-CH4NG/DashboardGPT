/**
 * MCP server: how other services (the AI chat) discover component types,
 * read templates, validate specs, render previews and publish components —
 * without importing any dashboard code.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { componentSpec, componentTypeEnum, componentTypes, gridSize, validateComponent, type ComponentType } from "../shared/schema.ts";
import { Invalid, NotFound, type Store } from "./store.ts";

const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4100}`).replace(/\/$/, "");

const ok = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
});
const fail = (message: string, extra: Record<string, unknown> = {}) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ ok: false, message, ...extra }, null, 2) }],
  isError: true,
});

async function guard<T>(fn: () => Promise<T> | T) {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof Invalid) return fail("component spec is invalid", { errors: e.errors });
    if (e instanceof NotFound) return fail(e.message);
    throw e;
  }
}

/** Envelope fields shown to the model; `data` is described per type by get_component_schema. */
const specInput = z
  .object({
    id: z.string().optional().describe("lowercase-kebab-case English id, 3–64 chars, e.g. platform-temperature"),
    type: componentTypeEnum,
    title: z.string().describe("Short Traditional Chinese title, max 40 chars"),
    description: z.string().optional().describe("One or two sentences for the ? help popover: what it shows, data source, units"),
    grid: gridSize.describe("Default size: colSpan 1–12 (right panel is 4 columns wide), rowSpan 1–8 (one row ≈ 84px)"),
    data: z.any().describe("Shape depends on type — call get_component_schema first"),
    options: z.record(z.any()).optional().describe("accent, decimals, stacked, smooth, thresholds {warn, alert}"),
  })
  .passthrough();

function withId(store: Store, spec: Record<string, unknown>) {
  if (typeof spec.id === "string" && /^[a-z0-9-]{3,64}$/.test(spec.id)) return spec;
  return { ...spec, id: store.uniqueId(typeof spec.id === "string" ? spec.id : `ai-${spec.type ?? "component"}`) };
}

export function createMcpServer(store: Store) {
  const server = new McpServer({ name: "dashboard", version: "0.1.0" });
  const exampleOf = (type: ComponentType) => store.listComponents().find((c) => c.type === type);

  server.registerTool(
    "list_component_types",
    {
      title: "List component types",
      description: "Lists every component type the dashboard can render, what kind of data each fits, and whether it is a number, chart or list.",
      inputSchema: {},
    },
    async () =>
      ok({
        types: (Object.keys(componentTypes) as ComponentType[]).map((t) => ({
          type: t,
          label: componentTypes[t].label,
          kind: componentTypes[t].kind,
          fits: componentTypes[t].fits,
        })),
      }),
  );

  server.registerTool(
    "get_component_schema",
    {
      title: "Get component schema",
      description: "Returns the JSON Schema of `data` for one component type, the envelope schema, and a working example spec.",
      inputSchema: { type: componentTypeEnum },
    },
    async ({ type }) =>
      ok({
        type,
        dataSchema: zodToJsonSchema(componentTypes[type].data, { $refStrategy: "none" }),
        envelopeSchema: zodToJsonSchema(componentSpec.omit({ source: true, data: true }), { $refStrategy: "none" }),
        example: exampleOf(type) ?? null,
      }),
  );

  server.registerTool(
    "list_templates",
    {
      title: "List templates",
      description: "Lists the component templates in the dashboard library (builtin and AI-made). Each template is one component.",
      inputSchema: {},
    },
    async () =>
      ok({
        templates: store.listComponents().map((c) => ({
          id: c.id,
          title: c.title,
          type: c.type,
          typeLabel: componentTypes[c.type].label,
          description: c.description ?? "",
          source: c.source?.kind ?? "builtin",
          createdAt: c.source?.createdAt,
        })),
      }),
  );

  server.registerTool(
    "get_template",
    { title: "Get template", description: "Returns the full spec of one template, including its sample data.", inputSchema: { id: z.string() } },
    async ({ id }) => guard(() => store.getComponent(id)),
  );

  server.registerTool(
    "validate_component",
    {
      title: "Validate component",
      description: "Checks a component spec against the dashboard contract. Returns { ok, errors[{path, message}] }. Does not save anything.",
      inputSchema: { spec: specInput },
    },
    async ({ spec }) => {
      const r = validateComponent(withId(store, spec));
      return ok(r.ok ? { ok: true } : { ok: false, errors: r.errors });
    },
  );

  server.registerTool(
    "create_draft",
    {
      title: "Create draft preview",
      description: "Validates the spec and stores it as a draft. Returns draftId and previewUrl (an embeddable page rendered by the dashboard).",
      inputSchema: { spec: specInput },
    },
    async ({ spec }) =>
      guard(async () => {
        const d = await store.createDraft(withId(store, spec));
        return { ok: true, draftId: d.draftId, previewUrl: `${PUBLIC_URL}/embed/preview/${d.draftId}`, spec: d.spec };
      }),
  );

  server.registerTool(
    "update_draft",
    {
      title: "Update draft preview",
      description: "Replaces the spec of an existing draft. Open previews refresh by themselves.",
      inputSchema: { draftId: z.string(), spec: specInput },
    },
    async ({ draftId, spec }) =>
      guard(async () => {
        const d = await store.updateDraft(draftId, withId(store, spec));
        return { ok: true, draftId, previewUrl: `${PUBLIC_URL}/embed/preview/${draftId}`, spec: d.spec };
      }),
  );

  server.registerTool(
    "save_to_library",
    {
      title: "Save draft to library",
      description: "Publishes a draft as a new template in the dashboard library so it can be placed on the page. Returns componentId.",
      inputSchema: { draftId: z.string(), title: z.string().optional() },
    },
    async ({ draftId, title }) =>
      guard(async () => {
        const c = await store.promoteDraft(draftId, { title });
        return { ok: true, componentId: c.id, title: c.title };
      }),
  );

  server.registerTool(
    "list_slots",
    {
      title: "List page slots",
      description: "Lists the slots on the dashboard page and which component each holds.",
      inputSchema: {},
    },
    async () => ok({ slots: store.listSlots() }),
  );

  server.registerTool(
    "apply_to_slot",
    {
      title: "Place component in slot",
      description: "Replaces the component in one page slot with a library component. Only call when the user explicitly asked.",
      inputSchema: { slotId: z.string(), componentId: z.string() },
    },
    async ({ slotId, componentId }) => guard(async () => ({ ok: true, slot: await store.replaceSlot(slotId, componentId) })),
  );

  return server;
}
