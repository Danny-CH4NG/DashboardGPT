/**
 * Entry point: `npm start` locally, and Vercel's Fastify runtime in the cloud.
 * Vercel recognises the framework by this file importing "fastify" directly.
 */
import Fastify from "fastify";
import { startServer } from "./server/index.ts";

await startServer(Fastify);
