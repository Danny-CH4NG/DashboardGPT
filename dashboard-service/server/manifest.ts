/**
 * The backend's view of the component types: loaded from component-manifest.json,
 * which the frontend build produces. Validation and the MCP tools are driven by
 * this data, so adding a component type needs no backend change.
 *
 * Source: MANIFEST_URL (e.g. the frontend's deployed /component-manifest.json)
 * or MANIFEST_FILE (default dist/component-manifest.json). Reloaded periodically.
 */
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import AjvModule, { type ErrorObject, type ValidateFunction } from "ajv";
import { checkRules, type Rule } from "./rules.ts";

// ajv ships CommonJS; under ESM the class can sit on .default.
const Ajv = ((AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule) as typeof AjvModule;

export const SUPPORTED_FORMAT = 1;

export type ManifestType = {
  type: string;
  version: number;
  label: string;
  kind: "number" | "chart" | "list";
  fits: string;
  defaultGrid: { colSpan: number; rowSpan: number };
  dataSchema: Record<string, unknown>;
  optionsSchema: Record<string, unknown>;
  rules: Rule[];
  example: { title: string; description?: string; data: unknown; options?: Record<string, unknown> };
};
export type Manifest = { format: number; version: string; generatedAt: string; envelopeSchema: Record<string, unknown>; types: ManifestType[] };

export type ComponentSpec = {
  id: string;
  type: string;
  title: string;
  description?: string;
  grid: { colSpan: number; rowSpan: number };
  data: unknown;
  options?: Record<string, unknown>;
  source?: { kind: "builtin" | "ai"; createdAt: string; templateId?: string; manifestVersion?: string };
};
export type ValidationIssue = { path: string; message: string };
export type ValidationResult = { ok: true; spec: ComponentSpec } | { ok: false; errors: ValidationIssue[] };

type Compiled = { manifest: Manifest; envelope: ValidateFunction; types: Map<string, { meta: ManifestType; data: ValidateFunction; options: ValidateFunction }> };

export class ManifestUnavailable extends Error {}

function ajvIssues(errors: ErrorObject[] | null | undefined, prefix: string): ValidationIssue[] {
  return (errors ?? []).map((e) => {
    const parts = e.instancePath.split("/").filter(Boolean);
    if (e.keyword === "required") parts.push(String(e.params.missingProperty));
    if (e.keyword === "additionalProperties") parts.push(String(e.params.additionalProperty));
    const message = e.keyword === "additionalProperties" ? "is not an allowed property" : (e.message ?? "is invalid");
    return { path: [prefix, ...parts].filter(Boolean).join("."), message };
  });
}

export class ManifestRegistry extends EventEmitter {
  private compiled: Compiled | null = null;
  private lastError: string | null = null;
  private loadedAt: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private source: { url?: string; file?: string }) {
    super();
  }

  get sourceLabel() {
    return this.source.url ?? this.source.file ?? "(none)";
  }

  private async fetchManifest(): Promise<Manifest> {
    if (this.source.url) {
      const res = await fetch(this.source.url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${this.source.url}`);
      return (await res.json()) as Manifest;
    }
    if (this.source.file) return JSON.parse(await readFile(this.source.file, "utf8")) as Manifest;
    throw new Error("no manifest source configured");
  }

  /** Accepts an already-parsed manifest (used by load() and by tests). */
  use(m: Manifest) {
    if (m.format !== SUPPORTED_FORMAT) throw new Error(`manifest format ${m.format} is not supported (expected ${SUPPORTED_FORMAT})`);
    if (!Array.isArray(m.types) || m.types.length === 0) throw new Error("manifest has no component types");
    const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
    const types = new Map<string, { meta: ManifestType; data: ValidateFunction; options: ValidateFunction }>();
    for (const t of m.types) types.set(t.type, { meta: t, data: ajv.compile(t.dataSchema), options: ajv.compile(t.optionsSchema) });
    const changed = this.compiled?.manifest.version !== m.version;
    this.compiled = { manifest: m, envelope: ajv.compile(m.envelopeSchema), types };
    this.lastError = null;
    this.loadedAt = new Date().toISOString();
    if (changed) this.emit("changed", m.version);
    return changed;
  }

  /** Loads (or reloads) the manifest. Keeps the previous one if the new one fails. */
  async load() {
    try {
      return this.use(await this.fetchManifest());
    } catch (e) {
      this.lastError = (e as Error).message;
      throw e;
    }
  }

  startAutoReload(intervalMs: number, onError: (e: Error) => void) {
    this.timer = setInterval(() => this.load().catch(onError), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private require() {
    if (!this.compiled) throw new ManifestUnavailable(`component manifest not loaded from ${this.sourceLabel}${this.lastError ? `: ${this.lastError}` : ""}`);
    return this.compiled;
  }

  get version() {
    return this.compiled?.manifest.version ?? null;
  }
  types(): ManifestType[] {
    return this.require().manifest.types;
  }
  typeNames(): string[] {
    return this.types().map((t) => t.type);
  }
  get(type: string) {
    return this.require().types.get(type)?.meta;
  }
  envelopeSchema() {
    return this.require().manifest.envelopeSchema;
  }
  status() {
    return {
      source: this.sourceLabel,
      loaded: !!this.compiled,
      version: this.version,
      generatedAt: this.compiled?.manifest.generatedAt ?? null,
      loadedAt: this.loadedAt,
      types: this.compiled ? this.typeNames() : [],
      error: this.lastError,
    };
  }

  /** Envelope, then the type's data and options schemas, then its rules. Returns a normalised copy (defaults applied). */
  validate(input: unknown): ValidationResult {
    const c = this.require();
    if (!input || typeof input !== "object") return { ok: false, errors: [{ path: "", message: "spec must be an object" }] };
    const spec = structuredClone(input) as Record<string, unknown>;
    const { data, options = {}, ...env } = spec;
    if (!c.envelope(env)) return { ok: false, errors: ajvIssues(c.envelope.errors, "") };
    const t = c.types.get(String(env.type));
    if (!t) return { ok: false, errors: [{ path: "type", message: `unknown component type "${env.type}"; known: ${[...c.types.keys()].join(", ")}` }] };
    const errors: ValidationIssue[] = [];
    if (!t.data(data)) errors.push(...ajvIssues(t.data.errors, "data"));
    if (!t.options(options)) errors.push(...ajvIssues(t.options.errors, "options"));
    if (errors.length === 0)
      errors.push(...checkRules(data, t.meta.rules).map((i) => ({ path: ["data", ...i.path].join("."), message: i.message })));
    if (errors.length) return { ok: false, errors };
    return { ok: true, spec: { ...(env as Omit<ComponentSpec, "data" | "options">), data, ...(Object.keys(options as object).length ? { options: options as Record<string, unknown> } : {}) } };
  }
}
