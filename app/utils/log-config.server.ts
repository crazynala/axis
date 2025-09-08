import { prisma } from "./prisma.server";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

export type LogLevels = Record<string, LogLevel>;

let cachedLevels: LogLevels | null = null;
let cachedAt = 0;
const CACHE_MS = 5_000; // small cache to reduce DB reads under load

export async function loadLogLevels(): Promise<LogLevels> {
  const now = Date.now();
  if (cachedLevels && now - cachedAt < CACHE_MS) return cachedLevels;
  // 1) Try DB SavedView(module: "log", name: "levels")
  try {
    const row = await prisma.savedView.findFirst({
      where: { module: "log", name: "levels" },
    });
    if (row && row.params && typeof row.params === "object") {
      const merged = { default: "info", ...(row.params as any) } as LogLevels;
      cachedLevels = merged;
      cachedAt = now;
      return merged;
    }
  } catch {
    // ignore and fall back
  }
  // 2) Fallback to ENV
  try {
    const raw = (globalThis as any).process?.env?.LOG_LEVELS ?? "{}";
    const parsed = JSON.parse(raw);
    const merged = { default: "info", ...parsed } as LogLevels;
    cachedLevels = merged;
    cachedAt = now;
    return merged;
  } catch {
    const merged = { default: "info" } as LogLevels;
    cachedLevels = merged;
    cachedAt = now;
    return merged;
  }
}

export async function saveLogLevels(levels: LogLevels): Promise<void> {
  // Persist to SavedView(module: log, name: levels)
  const payload = { ...levels };
  // Ensure default always exists
  if (!payload.default) payload.default = "info";
  const existing = await prisma.savedView.findFirst({
    where: { module: "log", name: "levels" },
  });
  if (existing) {
    await prisma.savedView.update({
      where: { id: existing.id },
      data: { params: payload, updatedAt: new Date() },
    });
  } else {
    await prisma.savedView.create({
      data: { module: "log", name: "levels", params: payload },
    });
  }
  // update cache
  cachedLevels = payload;
  cachedAt = Date.now();
}
