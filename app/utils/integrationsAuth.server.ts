import { json } from "@remix-run/node";

export function assertIntegrationsAuth(request: Request) {
  const auth =
    request.headers.get("authorization") ||
    request.headers.get("Authorization");
  const apiKey = process.env.INTEGRATIONS_API_KEY || process.env.AXIS_API_KEY;
  if (!apiKey) {
    // Fail closed if no key configured
    throw json({ error: "Integration API not configured" }, { status: 503 });
  }
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    throw json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice(7).trim();
  const allowed = apiKey
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(token)) {
    throw json({ error: "Unauthorized" }, { status: 401 });
  }
}

export function getLimitOffset(url: URL, defaults = { limit: 30, max: 100 }) {
  let limit = Number(url.searchParams.get("limit") || defaults.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaults.limit;
  limit = Math.min(limit, defaults.max);
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  return { limit, offset };
}
