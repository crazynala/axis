export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";
export type LogLevels = Record<string, LogLevel>;
type Fields = Record<string, unknown>;

const rank: Record<LogLevel, number> = {
  silent: 999,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

function currentLevels(): LogLevels {
  return (window as any).__LOG_LEVELS__ ?? { default: "info" };
}

function shouldLog(moduleName: string, level: LogLevel) {
  const levels = currentLevels();
  const moduleLevel = levels[moduleName] ?? levels.default ?? "info";
  return rank[level] >= rank[moduleLevel] && level !== "silent";
}

function ship(level: LogLevel, moduleName: string, payload: any) {
  if (rank[level] < rank["warn"]) return; // only warn+error to server
  const body = JSON.stringify({ level, module: moduleName, time: Date.now(), ...payload });
  navigator.sendBeacon?.("/log", body) || fetch("/log", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
}

export function getClientLogger(moduleName: string) {
  function emit(level: LogLevel, fields: Fields | null, msg?: string) {
    if (!shouldLog(moduleName, level)) return;
    const entry = fields ? { ...fields, msg } : { msg };
    const tag = `[${moduleName}]`;
    switch (level) {
      case "error":
        console.error(tag, msg ?? "", fields ?? {});
        break;
      case "warn":
        console.warn(tag, msg ?? "", fields ?? {});
        break;
      case "info":
        console.info(tag, msg ?? "", fields ?? {});
        break;
      case "debug":
        console.debug(tag, msg ?? "", fields ?? {});
        break;
      default:
        console.log(tag, msg ?? "", fields ?? {});
    }
    ship(level, moduleName, entry);
  }

  return {
    trace: (f?: Fields, m?: string) => emit("trace", f ?? null, m),
    debug: (f?: Fields, m?: string) => emit("debug", f ?? null, m),
    info: (f?: Fields, m?: string) => emit("info", f ?? null, m),
    warn: (f?: Fields, m?: string) => emit("warn", f ?? null, m),
    error: (f?: Fields, m?: string) => emit("error", f ?? null, m),
  } as const;
}
