import type { FieldConfig } from "~/base/forms/fieldConfigShared";
import type {
  ProductAttributeDataType,
  ProductAttributeDefinition,
} from "~/modules/productMetadata/types/productMetadata";

const META_PREFIX = "meta__";

export function metaFieldName(key: string) {
  return `${META_PREFIX}${key}`;
}

export function normalizeEnumOptions(raw: unknown):
  | { value: string; label: string }[]
  | [] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((entry: any) => {
        if (entry == null) return null;
        if (typeof entry === "string") return { value: entry, label: entry };
        if (typeof entry === "object") {
          const v = (entry as any).value ?? (entry as any).label;
          if (v == null) return null;
          return { value: String(v), label: String((entry as any).label ?? v) };
        }
        return { value: String(entry), label: String(entry) };
      })
      .filter(Boolean) as { value: string; label: string }[];
  }
  return [];
}

export function formatEnumOptionsInput(raw: unknown) {
  const options = normalizeEnumOptions(raw);
  return options.map((opt) => opt.value).join("\n");
}

export function parseEnumOptionsInput(raw: string | null) {
  if (!raw) return [] as string[];
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseAppliesToTypesInput(raw: string | null) {
  if (!raw) return [] as string[];
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildProductMetadataFields(
  defs: ProductAttributeDefinition[],
  opts?: { onlyFilterable?: boolean }
): FieldConfig[] {
  const onlyFilterable = Boolean(opts?.onlyFilterable);
  return defs
    .filter((def) => (onlyFilterable ? def.isFilterable : true))
    .map((def) => {
      const name = metaFieldName(def.key);
      const findOp = buildFindOp(def.dataType);
      const options =
        def.dataType === "ENUM"
          ? normalizeEnumOptions(def.enumOptions)
          : def.dataType === "BOOLEAN"
          ? [
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ]
          : undefined;
      const widget = buildWidget(def.dataType);
      return {
        name,
        label: def.label || def.key,
        widget,
        options,
        findOp: def.isFilterable ? findOp : undefined,
        showIf: ({ form, mode }) => {
          if (mode === "find") return true;
          if (!def.appliesToProductTypes?.length) return true;
          const t = String(form.getValues()?.type || "").toLowerCase();
          if (!t) return false;
          return def.appliesToProductTypes.some(
            (entry) => String(entry).toLowerCase() === t
          );
        },
      } as FieldConfig;
    });
}

export function buildProductMetadataDefaults(
  defs: ProductAttributeDefinition[],
  valuesByKey?: Record<string, any> | null,
  opts?: { forFind?: boolean }
) {
  const out: Record<string, any> = {};
  const forFind = Boolean(opts?.forFind);
  for (const def of defs) {
    const name = metaFieldName(def.key);
    if (forFind && def.dataType === "NUMBER") {
      out[`${name}Min`] = undefined;
      out[`${name}Max`] = undefined;
      out[name] = undefined;
      continue;
    }
    if (!valuesByKey) {
      out[name] = def.dataType === "BOOLEAN" ? null : "";
      continue;
    }
    const value = valuesByKey[def.key];
    if (value == null) {
      out[name] = def.dataType === "BOOLEAN" ? null : "";
    } else {
      out[name] = value;
    }
  }
  return out;
}

function buildWidget(dataType: ProductAttributeDataType): FieldConfig["widget"] {
  if (dataType === "NUMBER") return "numberRange";
  if (dataType === "ENUM") return "select";
  if (dataType === "BOOLEAN") return "select";
  return "text";
}

function buildFindOp(dataType: ProductAttributeDataType) {
  switch (dataType) {
    case "NUMBER":
      return "range";
    case "ENUM":
      return "equals";
    case "BOOLEAN":
      return "equals";
    case "STRING":
    case "JSON":
    default:
      return "contains";
  }
}
