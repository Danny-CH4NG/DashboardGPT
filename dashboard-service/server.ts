/**
 * Entry point: `npm start` locally, and Vercel's Fastify runtime in the cloud.
 * Vercel recognises the framework by this file importing "fastify" directly.
 * No top-level await: Vercel loads this file with require(), which rejects modules that use it.
 */
import Fastify from "fastify";
import { startServer } from "./server/index.ts";

startServer(Fastify).catch((e) => {
  console.error(e);
  process.exit(1);
});
