/**
 * Which browser origins may call this service. Loopback origins (localhost,
 * 127.0.0.1, [::1] on any port) are always allowed so local runs work however
 * the page was opened; anything else must be listed in ALLOWED_ORIGINS.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function originChecker(allowed: string[]) {
  const list = new Set(allowed.map((o) => o.trim().replace(/\/$/, "")).filter(Boolean));
  return (origin: string | undefined): boolean => {
    if (!origin) return false;
    if (list.has("*") || list.has(origin)) return true;
    try {
      return LOOPBACK.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  };
}
