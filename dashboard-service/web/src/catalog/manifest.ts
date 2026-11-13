/**
 * Builds component-manifest.json: the published description of every component
 * type (JSON Schema for data/options, rules, examples). The backend validates and
 * serves MCP from this file; it never imports frontend code.
 */
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { definitions } from "./definitions.ts";
import { envelope } from "./envelope.ts";

export const MANIFEST_FORMAT = 1;

const toJson = (s: ZodTypeAny) => {
  const { $schema: _drop, ...rest } = zodToJsonSchema(s, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  return rest;
};

/** Small stable hash so the version changes only when the content does. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildManifest() {
  const body = {
    format: MANIFEST_FORMAT,
    envelopeSchema: toJson(envelope),
    types: definitions.map((d) => ({
      type: d.type,
      version: d.version,
      label: d.label,
      kind: d.kind,
      fits: d.fits,
      defaultGrid: d.defaultGrid,
      dataSchema: toJson(d.data),
      optionsSchema: toJson(d.options),
      rules: d.rules ?? [],
      example: d.example,
    })),
  };
  return { ...body, version: hash(JSON.stringify(body)), generatedAt: new Date().toISOString() };
}

export type Manifest = ReturnType<typeof buildManifest>;
