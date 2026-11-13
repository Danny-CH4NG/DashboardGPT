/**
 * Loads <service>/.env if present, before any other module reads process.env.
 * Works the same on Windows (PowerShell/cmd), macOS and Linux. Variables already
 * set in the environment win over the file.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(file)) process.loadEnvFile(file);
