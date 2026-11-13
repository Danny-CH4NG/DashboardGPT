/** Entry point: `npm start` locally, and Vercel's Fastify runtime in the cloud. */
import { startServer } from "./server/index.ts";

await startServer();
