/**
 * Where the dashboard keeps its data. Three interchangeable backends:
 *  - Redis (Upstash REST)  → serverless (Vercel): set KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN
 *  - JSON file             → local runs and Docker (DATA_FILE)
 *  - memory                → fallback when neither is usable (data lasts only while the instance lives)
 * A revision counter lets pages poll cheaply for changes instead of holding a connection open.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { Layout } from "./layout.ts";
import type { ComponentSpec } from "./manifest.ts";

export type Draft = { draftId: string; spec: ComponentSpec; createdAt: string };
export type Seed = { components: ComponentSpec[]; layout: Layout };

export interface StorageBackend {
  readonly kind: "redis" | "file" | "memory";
  init(seed: Seed): Promise<void>;
  listComponents(): Promise<ComponentSpec[]>;
  getComponent(id: string): Promise<ComponentSpec | null>;
  putComponent(spec: ComponentSpec): Promise<void>;
  getLayout(): Promise<Layout>;
  putLayout(layout: Layout): Promise<void>;
  getDraft(id: string): Promise<Draft | null>;
  putDraft(draft: Draft): Promise<void>;
  revision(): Promise<number>;
  bump(): Promise<number>;
}

type Db = { components: Record<string, ComponentSpec>; layout: Layout; drafts: Record<string, Draft>; rev: number };

/** Whole database in one JSON document: in memory, optionally mirrored to a file. */
export class DocumentBackend implements StorageBackend {
  private db!: Db;
  private writing: Promise<void> = Promise.resolve();
  constructor(private file: string | null) {}
  get kind() {
    return this.file ? ("file" as const) : ("memory" as const);
  }

  async init(seed: Seed) {
    if (this.file && existsSync(this.file)) {
      this.db = JSON.parse(await readFile(this.file, "utf8"));
      this.db.drafts ??= {};
      this.db.rev ??= 1;
      return;
    }
    this.db = { components: Object.fromEntries(seed.components.map((c) => [c.id, c])), layout: structuredClone(seed.layout), drafts: {}, rev: 1 };
    await this.persist();
  }

  private persist() {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    const snapshot = JSON.stringify(this.db, null, 2);
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, snapshot);
      await rename(`${file}.tmp`, file);
    });
    return this.writing;
  }

  async listComponents() {
    return Object.values(this.db.components);
  }
  async getComponent(id: string) {
    return this.db.components[id] ?? null;
  }
  async putComponent(spec: ComponentSpec) {
    this.db.components[spec.id] = spec;
    await this.persist();
  }
  async getLayout() {
    return structuredClone(this.db.layout);
  }
  async putLayout(layout: Layout) {
    this.db.layout = layout;
    await this.persist();
  }
  async getDraft(id: string) {
    return this.db.drafts[id] ?? null;
  }
  async putDraft(d: Draft) {
    this.db.drafts[d.draftId] = d;
    await this.persist();
  }
  async revision() {
    return this.db.rev;
  }
  async bump() {
    this.db.rev += 1;
    await this.persist();
    return this.db.rev;
  }
}

const DRAFT_TTL_SECONDS = 7 * 24 * 3600;

/** Redis via Upstash's HTTP API (no connection to keep open, so it suits serverless). */
export class RedisBackend implements StorageBackend {
  readonly kind = "redis" as const;
  constructor(
    private redis: Redis,
    private prefix = "dgpt:",
  ) {}
  private k(key: string) {
    return `${this.prefix}${key}`;
  }

  async init(seed: Seed) {
    // Only the first instance to get here seeds the database.
    const first = await this.redis.set(this.k("seeded"), new Date().toISOString(), { nx: true });
    if (!first) return;
    await this.redis.hset(this.k("components"), Object.fromEntries(seed.components.map((c) => [c.id, JSON.stringify(c)])));
    await this.redis.set(this.k("layout"), JSON.stringify(seed.layout));
    await this.redis.set(this.k("rev"), 1);
  }

  private parse<T>(v: unknown): T | null {
    if (v == null) return null;
    return (typeof v === "string" ? JSON.parse(v) : v) as T;
  }

  async listComponents() {
    const all = (await this.redis.hgetall<Record<string, unknown>>(this.k("components"))) ?? {};
    return Object.values(all).map((v) => this.parse<ComponentSpec>(v)!);
  }
  async getComponent(id: string) {
    return this.parse<ComponentSpec>(await this.redis.hget(this.k("components"), id));
  }
  async putComponent(spec: ComponentSpec) {
    await this.redis.hset(this.k("components"), { [spec.id]: JSON.stringify(spec) });
  }
  async getLayout() {
    const l = this.parse<Layout>(await this.redis.get(this.k("layout")));
    if (!l) throw new Error("layout missing from Redis; was the store initialised?");
    return l;
  }
  async putLayout(layout: Layout) {
    await this.redis.set(this.k("layout"), JSON.stringify(layout));
  }
  async getDraft(id: string) {
    return this.parse<Draft>(await this.redis.get(this.k(`draft:${id}`)));
  }
  async putDraft(d: Draft) {
    await this.redis.set(this.k(`draft:${d.draftId}`), JSON.stringify(d), { ex: DRAFT_TTL_SECONDS });
  }
  async revision() {
    return Number((await this.redis.get(this.k("rev"))) ?? 0);
  }
  async bump() {
    return this.redis.incr(this.k("rev"));
  }
}

/** Picks the backend from the environment. */
export function backendFromEnv(defaultFile: string): StorageBackend {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new RedisBackend(new Redis({ url, token }), process.env.REDIS_KEY_PREFIX ?? "dgpt:");
  // Serverless file systems are read-only or temporary: keep data in memory there.
  if (process.env.VERCEL) return new DocumentBackend(null);
  return new DocumentBackend(process.env.DATA_FILE ?? defaultFile);
}
