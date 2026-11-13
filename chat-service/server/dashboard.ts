/** The chat service's only link to the dashboard: an MCP client. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type Anthropic from "@anthropic-ai/sdk";

export class DashboardUnavailable extends Error {}

export type ToolOutcome = { isError: boolean; text: string; data: Record<string, unknown> | null };

export class DashboardClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private toolCache: Anthropic.Beta.BetaTool[] | null = null;

  constructor(private url: string) {}

  private async connect() {
    if (this.client) return this.client;
    this.connecting ??= (async () => {
      const c = new Client({ name: "chat-service", version: "0.1.0" });
      try {
        await c.connect(new StreamableHTTPClientTransport(new URL(this.url)));
      } catch (e) {
        throw new DashboardUnavailable(`cannot reach dashboard MCP at ${this.url}: ${(e as Error).message}`);
      }
      this.client = c;
      return c;
    })().finally(() => (this.connecting = null));
    return this.connecting;
  }

  /** Runs `fn`, reconnecting once if the dashboard restarted in between. */
  private async withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.connect());
    } catch (e) {
      if (e instanceof DashboardUnavailable) throw e;
      this.client = null;
      try {
        return await fn(await this.connect());
      } catch (e2) {
        if (e2 instanceof DashboardUnavailable) throw e2;
        throw new DashboardUnavailable((e2 as Error).message);
      }
    }
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> {
    const r = await this.withClient((c) => c.callTool({ name, arguments: args }));
    const text = ((r.content as { type: string; text?: string }[]) ?? []).map((b) => b.text ?? "").join("\n");
    let data: Record<string, unknown> | null = null;
    try {
      data = (r.structuredContent as Record<string, unknown>) ?? JSON.parse(text);
    } catch {
      data = null;
    }
    return { isError: !!r.isError, text, data };
  }

  /** Dashboard MCP tools converted to Claude tool definitions, filtered to `allow`. */
  async claudeTools(allow: string[]): Promise<Anthropic.Beta.BetaTool[]> {
    if (!this.toolCache) {
      const { tools } = await this.withClient((c) => c.listTools());
      this.toolCache = tools.map((t) => ({
        name: t.name,
        description: t.description ?? t.title ?? t.name,
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      }));
    }
    return this.toolCache.filter((t) => allow.includes(t.name));
  }

  async ping() {
    try {
      await this.withClient((c) => c.ping());
      return true;
    } catch {
      return false;
    }
  }
}
