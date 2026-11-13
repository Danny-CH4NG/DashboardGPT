import { randomUUID } from "node:crypto";
import { layout as layoutSchema, zoneIds, type GridSize, type Layout } from "./layout.ts";
import type { ComponentSpec, ManifestRegistry, ValidationIssue } from "./manifest.ts";
import { seedComponents, seedLayout } from "./seed.ts";
import type { Draft, StorageBackend } from "./storage.ts";

export class NotFound extends Error {}
export class Invalid extends Error {
  constructor(public errors: ValidationIssue[]) {
    super(errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; "));
  }
}

/** Dashboard data operations; persistence is delegated to a StorageBackend. */
export class Store {
  constructor(
    private backend: StorageBackend,
    private manifest: ManifestRegistry,
  ) {}

  get backendKind() {
    return this.backend.kind;
  }

  init() {
    return this.backend.init({ components: seedComponents, layout: seedLayout });
  }

  /** Bumped on every write; pages poll it to know when to refresh. */
  revision() {
    return this.backend.revision();
  }

  /** Validation comes from the component manifest published by the frontend. */
  private validate(input: unknown): ComponentSpec {
    const r = this.manifest.validate(input);
    if (!r.ok) throw new Invalid(r.errors);
    return { ...r.spec, source: r.spec.source && { ...r.spec.source, manifestVersion: this.manifest.version ?? undefined } };
  }

  // ---- library ----
  listComponents() {
    return this.backend.listComponents();
  }
  async getComponent(id: string) {
    const c = await this.backend.getComponent(id);
    if (!c) throw new NotFound(`component ${id} not found`);
    return c;
  }
  async saveComponent(input: unknown) {
    const spec = this.validate(input);
    await this.backend.putComponent(spec);
    await this.backend.bump();
    return spec;
  }

  /** Makes an id unique within the library by suffixing -2, -3 … */
  async uniqueId(base: string) {
    const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "component";
    const stem = clean.length >= 3 ? clean : `${clean}-c`;
    let id = stem;
    for (let n = 2; await this.backend.getComponent(id); n++) id = `${stem}-${n}`;
    return id;
  }

  // ---- drafts ----
  async createDraft(input: unknown): Promise<Draft> {
    const d = { draftId: randomUUID(), spec: this.validate(input), createdAt: new Date().toISOString() };
    await this.backend.putDraft(d);
    await this.backend.bump();
    return d;
  }
  async updateDraft(draftId: string, input: unknown) {
    const d = await this.getDraft(draftId);
    const next = { ...d, spec: this.validate(input) };
    await this.backend.putDraft(next);
    await this.backend.bump();
    return next;
  }
  async getDraft(draftId: string) {
    const d = await this.backend.getDraft(draftId);
    if (!d) throw new NotFound(`draft ${draftId} not found`);
    return d;
  }
  async promoteDraft(draftId: string, opts: { title?: string } = {}) {
    const d = await this.getDraft(draftId);
    const existing = await this.backend.getComponent(d.spec.id);
    const id = await this.uniqueId(existing?.source?.kind === "builtin" ? `${d.spec.id}-ai` : d.spec.id);
    return this.saveComponent({
      ...d.spec,
      id,
      title: opts.title ?? d.spec.title,
      source: { kind: "ai", createdAt: new Date().toISOString(), templateId: d.spec.source?.templateId },
    });
  }

  // ---- layout ----
  getLayout() {
    return this.backend.getLayout();
  }
  async listSlots() {
    const [layout, components] = await Promise.all([this.backend.getLayout(), this.backend.listComponents()]);
    const titles = Object.fromEntries(components.map((c) => [c.id, c.title]));
    return zoneIds.flatMap((zone) => (layout.zones[zone]?.slots ?? []).map((s) => ({ zone, ...s, title: titles[s.componentId] })));
  }
  private findSlot(layout: Layout, slotId: string) {
    for (const zone of zoneIds) {
      const s = layout.zones[zone]?.slots.find((x) => x.slotId === slotId);
      if (s) return s;
    }
    throw new NotFound(`slot ${slotId} not found`);
  }
  async replaceSlot(slotId: string, componentId: string, opts: { keepSlotSize?: boolean } = {}) {
    const comp = await this.getComponent(componentId);
    const layout = await this.backend.getLayout();
    const s = this.findSlot(layout, slotId);
    s.componentId = componentId;
    if (opts.keepSlotSize === false) s.grid = comp.grid;
    await this.backend.putLayout(layout);
    await this.backend.bump();
    return s;
  }
  async resizeSlot(slotId: string, grid: GridSize) {
    const layout = await this.backend.getLayout();
    const s = this.findSlot(layout, slotId);
    s.grid = grid;
    layoutSchema.parse(layout);
    await this.backend.putLayout(layout);
    await this.backend.bump();
    return s;
  }
  async resetLayout() {
    const layout = structuredClone(seedLayout);
    await this.backend.putLayout(layout);
    await this.backend.bump();
    return layout;
  }
}
