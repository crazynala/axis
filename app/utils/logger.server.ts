import pino from "pino";
import type { LogLevels, LogLevel } from "./log-config.server";

const root = pino({
  level: "info",
  base: { service: "remix-app" },
  redact: {
    paths: ["req.headers.authorization", "password", "token", "ssn", "email"],
    censor: "[redacted]",
  },
});

const levelRank: Record<LogLevel, number> = {
  silent: 999,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

export function getServerLogger(moduleName: string, levels: LogLevels) {
  const moduleLevel = levels[moduleName] ?? levels.default ?? "info";
  // pino child logger; we pass level at creation time
  const child = root.child({ module: moduleName }, { level: moduleLevel });
  return child;
}

export function coerceLevel(level: string): LogLevel {
  if (["silent", "error", "warn", "info", "debug", "trace"].includes(level)) return level as LogLevel;
  return "info";
}
