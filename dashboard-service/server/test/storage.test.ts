import { describe, expect, it } from "vitest";
import { RedisBackend } from "../storage.ts";
import { seedComponents, seedLayout } from "../seed.ts";

/** In-memory stand-in for @upstash/redis, including its automatic JSON deserialisation. */
class FakeRedis {
  kv = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  private out(v: string | undefined) {
    if (v === undefined) return null;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  async set(k: string, v: unknown, opts?: { nx?: boolean; ex?: number }) {
    if (opts?.nx && this.kv.has(k)) return null;
    this.kv.set(k, typeof v === "string" ? v : JSON.stringify(v));
    return "OK";
  }
  async get(k: string) {
    return this.out(this.kv.get(k));
  }
  async incr(k: string) {
    const n = Number(this.kv.get(k) ?? 0) + 1;
    this.kv.set(k, String(n));
    return n;
  }
  async hset(k: string, fields: Record<string, string>) {
    const h = this.hashes.get(k) ?? new Map();
    Object.entries(fields).forEach(([f, v]) => h.set(f, v));
    this.hashes.set(k, h);
    return Object.keys(fields).length;
  }
  async hget(k: string, f: string) {
    return this.out(this.hashes.get(k)?.get(f));
  }
  async hgetall(k: string) {
    const h = this.hashes.get(k);
    return h ? Object.fromEntries([...h].map(([f, v]) => [f, this.out(v)])) : null;
  }
}

describe("RedisBackend", () => {
  it("seeds once, then reads and writes components, layout, drafts and revision", async () => {
    const redis = new FakeRedis();
    const a = new RedisBackend(redis as never);
    await a.init({ components: seedComponents, layout: seedLayout });
    expect((await a.listComponents()).length).toBe(seedComponents.length);
    expect((await a.getLayout()).zones.right?.columns).toBe(4);

    // A second instance must not re-seed over existing data.
    await a.putComponent({ ...seedComponents[0], title: "改過的標題" });
    const b = new RedisBackend(redis as never);
    await b.init({ components: seedComponents, layout: seedLayout });
    expect((await b.getComponent(seedComponents[0].id))?.title).toBe("改過的標題");

    const draft = { draftId: "d1", spec: seedComponents[1], createdAt: "now" };
    await b.putDraft(draft);
    expect(await a.getDraft("d1")).toEqual(draft);
    expect(await a.getDraft("missing")).toBeNull();

    const before = await a.revision();
    expect(await b.bump()).toBe(before + 1);
  });
});
