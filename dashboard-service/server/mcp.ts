/**
 * MCP server: how other services (the AI chat) discover component types,
 * read templates, validate specs, render previews and publish components.
 * Component types and their schemas come from the frontend's component manifest.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gridSize } from "./layout.ts";
import { ManifestUnavailable, type ManifestRegistry } from "./manifest.ts";
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
    if (e instanceof NotFound || e instanceof ManifestUnavailable) return fail(e.message);
    throw e;
  }
}

function withId(store: Store, spec: Record<string, unknown>) {
  if (typeof spec.id === "string" && /^[a-z0-9-]{3,64}$/.test(spec.id)) return spec;
  return { ...spec, id: store.uniqueId(typeof spec.id === "string" ? spec.id : `ai-${spec.type ?? "component"}`) };
}

export function createMcpServer(store: Store, manifest: ManifestRegistry) {
  const server = new McpServer({ name: "dashboard", version: "0.2.0" });
  // Built per request (stateless transport), so a reloaded manifest shows up immediately.
  const names = manifest.status().types;
  const typeField = (names.length ? z.enum(names as [string, ...string[]]) : z.string()).describe("Component type, see list_component_types");

  const specInput = z
    .object({
      id: z.string().optional().describe("lowercase-kebab-case English id, 3–64 chars, e.g. platform-temperature"),
      type: typeField,
      title: z.string().describe("Short Traditional Chinese title, max 40 chars"),
      description: z.string().optional().describe("One or two sentences for the ? help popover: what it shows, data source, units"),
      grid: gridSize.describe("Default size: colSpan 1–12 (right panel is 4 columns wide), rowSpan 1–8 (one row ≈ 84px)"),
      data: z.any().describe("Shape depends on type — call get_component_schema first"),
      options: z.record(z.any()).optional().describe("Allowed keys depend on type — see optionsSchema from get_component_schema"),
    })
    .passthrough();

  server.registerTool(
    "list_component_types",
    {
      title: "List component types",
      description: "Lists every component type the dashboard can render, what kind of data each fits, and whether it is a number, chart or list.",
      inputSchema: {},
    },
    async () =>
      guard(() => ({
        manifestVersion: manifest.version,
        types: manifest.types().map((t) => ({ type: t.type, label: t.label, kind: t.kind, fits: t.fits, defaultGrid: t.defaultGrid })),
      })),
  );

  server.registerTool(
    "get_component_schema",
    {
      title: "Get component schema",
      description:
        "Returns, for one component type: JSON Schema of `data` and `options`, cross-field rules, the envelope schema and a working example.",
      inputSchema: { type: typeField },
    },
    async ({ type }) =>
      guard(() => {
        const t = manifest.get(type);
        if (!t) throw new NotFound(`unknown component type "${type}"`);
        return {
          type: t.type,
          version: t.version,
          label: t.label,
          fits: t.fits,
          dataSchema: t.dataSchema,
          optionsSchema: t.optionsSchema,
          rules: t.rules,
          envelopeSchema: manifest.envelopeSchema(),
          defaultGrid: t.defaultGrid,
          example: t.example,
        };
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
          typeLabel: manifest.version ? (manifest.get(c.type)?.label ?? c.type) : c.type,
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
    async ({ spec }) =>
      guard(() => {
        const r = manifest.validate(withId(store, spec));
        return r.ok ? { ok: true } : { ok: false, errors: r.errors };
      }),
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
    { title: "List page slots", description: "Lists the slots on the dashboard page and which component each holds.", inputSchema: {} },
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
