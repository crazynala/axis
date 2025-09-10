import type { FieldConfig } from "../formConfigs/fieldConfigShared";

// Basic Prisma-compatible where builder using field configs + submitted values.
// Supports findOp: contains, equals, range (number/date), gte, lte and triBool encoded as "true"/"false".
// numberRange uses separate min/max keys (e.g. costPriceMin / costPriceMax) or rangeFields override.

export function buildWhereFromConfig(
  values: Record<string, any>,
  configs: FieldConfig[]
) {
  const where: Record<string, any> = {};
  const index: Record<string, FieldConfig> = {};
  for (const c of configs) index[c.name] = c;

  for (const [key, rawVal] of Object.entries(values)) {
    if (rawVal == null || rawVal === "") continue;
    const cfg = index[key];
    if (!cfg) {
      // Handle min/max for range when not directly declared as config name
      if (key.endsWith("Min") || key.endsWith("Max")) continue;
      where[key] = rawVal; // fallback (exact match)
      continue;
    }
    const op = cfg.findOp || "contains";
    if (cfg.widget === "triBool") {
      if (rawVal === "true" || rawVal === true) where[cfg.name] = true;
      else if (rawVal === "false" || rawVal === false) where[cfg.name] = false;
      continue;
    }
    if (cfg.widget === "numberRange" || op === "range") {
      const minKey = cfg.rangeFields?.min || `${cfg.name}Min`;
      const maxKey = cfg.rangeFields?.max || `${cfg.name}Max`;
      const minVal = values[minKey];
      const maxVal = values[maxKey];
      if (minVal !== undefined && minVal !== "") {
        where[cfg.name] = where[cfg.name] || {};
        where[cfg.name].gte = Number(minVal);
      }
      if (maxVal !== undefined && maxVal !== "") {
        where[cfg.name] = where[cfg.name] || {};
        where[cfg.name].lte = Number(maxVal);
      }
      continue;
    }
    switch (op) {
      case "equals":
        where[cfg.name] = coerce(rawVal);
        break;
      case "gte":
        where[cfg.name] = { gte: coerce(rawVal) };
        break;
      case "lte":
        where[cfg.name] = { lte: coerce(rawVal) };
        break;
      case "contains":
      default:
        if (typeof rawVal === "string") {
          where[cfg.name] = { contains: rawVal, mode: "insensitive" };
        } else {
          where[cfg.name] = rawVal;
        }
        break;
    }
  }
  // Handle standalone min/max fields for numberRange configs that had no direct main value submitted
  for (const cfg of configs) {
    if (cfg.widget === "numberRange") {
      const minKey = cfg.rangeFields?.min || `${cfg.name}Min`;
      const maxKey = cfg.rangeFields?.max || `${cfg.name}Max`;
      const minVal = values[minKey];
      const maxVal = values[maxKey];
      if (
        (minVal !== undefined && minVal !== "") ||
        (maxVal !== undefined && maxVal !== "")
      ) {
        where[cfg.name] = where[cfg.name] || {};
        if (minVal !== undefined && minVal !== "")
          where[cfg.name].gte = Number(minVal);
        if (maxVal !== undefined && maxVal !== "")
          where[cfg.name].lte = Number(maxVal);
      }
    }
  }
  return where;
}

function coerce(v: any) {
  if (v === null) return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (typeof v === "string" && v.match(/^\d+$/)) return Number(v);
  return v;
}
