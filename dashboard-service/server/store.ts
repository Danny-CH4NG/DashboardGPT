import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  layout as layoutSchema,
  validateComponent,
  zoneIds,
  type ComponentSpec,
  type GridSize,
  type Layout,
  type ValidationIssue,
} from "../shared/schema.ts";
import { seedComponents, seedLayout } from "../shared/seed.ts";

type Draft = { draftId: string; spec: ComponentSpec; createdAt: string };
type Db = { components: Record<string, ComponentSpec>; layout: Layout; drafts: Record<string, Draft> };

export type StoreEvent = { type: "layout.updated" | "library.updated" | "draft.updated"; id?: string };

export class NotFound extends Error {}
export class Invalid extends Error {
  constructor(public errors: ValidationIssue[]) {
    super(errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; "));
  }
}

/** JSON-file backed store. One process owns the file; writes are serialised. */
export class Store extends EventEmitter {
  private db!: Db;
  private writing: Promise<void> = Promise.resolve();
  constructor(private file: string) {
    super();
  }

  async init() {
    await mkdir(path.dirname(this.file), { recursive: true });
    if (existsSync(this.file)) {
      this.db = JSON.parse(await readFile(this.file, "utf8"));
      this.db.drafts ??= {};
    } else {
      this.db = {
        components: Object.fromEntries(seedComponents.map((c) => [c.id, c])),
        layout: seedLayout,
        drafts: {},
      };
      await this.persist();
    }
  }

  private persist() {
    const snapshot = JSON.stringify(this.db, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, this.file);
    });
    return this.writing;
  }

  private emitEvent(e: StoreEvent) {
    this.emit("event", e);
  }

  // ---- library ----
  listComponents() {
    return Object.values(this.db.components);
  }
  getComponent(id: string) {
    const c = this.db.components[id];
    if (!c) throw new NotFound(`component ${id} not found`);
    return c;
  }
  async saveComponent(input: unknown) {
    const r = validateComponent(input);
    if (!r.ok) throw new Invalid(r.errors);
    this.db.components[r.spec.id] = r.spec;
    await this.persist();
    this.emitEvent({ type: "library.updated", id: r.spec.id });
    return r.spec;
  }

  /** Makes an id unique within the library by suffixing -2, -3 … */
  uniqueId(base: string) {
    const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "component";
    let id = clean.length >= 3 ? clean : `${clean}-c`;
    for (let n = 2; this.db.components[id]; n++) id = `${clean}-${n}`;
    return id;
  }

  // ---- drafts ----
  async createDraft(input: unknown) {
    const r = validateComponent(input);
    if (!r.ok) throw new Invalid(r.errors);
    const draftId = randomUUID();
    this.db.drafts[draftId] = { draftId, spec: r.spec, createdAt: new Date().toISOString() };
    await this.persist();
    return this.db.drafts[draftId];
  }
  async updateDraft(draftId: string, input: unknown) {
    this.getDraft(draftId);
    const r = validateComponent(input);
    if (!r.ok) throw new Invalid(r.errors);
    this.db.drafts[draftId].spec = r.spec;
    await this.persist();
    this.emitEvent({ type: "draft.updated", id: draftId });
    return this.db.drafts[draftId];
  }
  getDraft(draftId: string) {
    const d = this.db.drafts[draftId];
    if (!d) throw new NotFound(`draft ${draftId} not found`);
    return d;
  }
  async promoteDraft(draftId: string, opts: { title?: string } = {}) {
    const d = this.getDraft(draftId);
    const title = opts.title ?? d.spec.title;
    const id = this.db.components[d.spec.id]?.source?.kind === "builtin" ? this.uniqueId(`${d.spec.id}-ai`) : this.uniqueId(d.spec.id);
    const spec: ComponentSpec = {
      ...d.spec,
      id,
      title,
      source: { kind: "ai", createdAt: new Date().toISOString(), templateId: d.spec.source?.templateId },
    };
    return this.saveComponent(spec);
  }

  // ---- layout ----
  getLayout() {
    return this.db.layout;
  }
  listSlots() {
    return zoneIds.flatMap((zone) =>
      (this.db.layout.zones[zone]?.slots ?? []).map((s) => ({ zone, ...s, title: this.db.components[s.componentId]?.title })),
    );
  }
  private findSlot(slotId: string) {
    for (const zone of zoneIds) {
      const s = this.db.layout.zones[zone]?.slots.find((x) => x.slotId === slotId);
      if (s) return s;
    }
    throw new NotFound(`slot ${slotId} not found`);
  }
  async replaceSlot(slotId: string, componentId: string, opts: { keepSlotSize?: boolean } = {}) {
    const comp = this.getComponent(componentId);
    const s = this.findSlot(slotId);
    s.componentId = componentId;
    if (opts.keepSlotSize === false) s.grid = comp.grid;
    await this.persist();
    this.emitEvent({ type: "layout.updated", id: slotId });
    return s;
  }
  async resizeSlot(slotId: string, grid: GridSize) {
    const s = this.findSlot(slotId);
    s.grid = grid;
    layoutSchema.parse(this.db.layout);
    await this.persist();
    this.emitEvent({ type: "layout.updated", id: slotId });
    return s;
  }
  async resetLayout() {
    this.db.layout = structuredClone(seedLayout);
    await this.persist();
    this.emitEvent({ type: "layout.updated" });
    return this.db.layout;
  }
}
