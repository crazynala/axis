import type { FieldConfig, RenderContext } from "./fieldConfigShared";

export type SelectOption = { value: string; label: string };

export type SelectOptionGroups = {
  primary: SelectOption[];
  fallback: SelectOption[];
};

export function getSelectOptions(
  field: FieldConfig,
  ctx?: RenderContext
): SelectOptionGroups {
  if (field.options && field.options.length) {
    return {
      primary: field.options,
      fallback: [],
    };
  }
  const primary =
    field.optionsKey && ctx?.fieldOptions?.[field.optionsKey]
      ? ctx.fieldOptions[field.optionsKey]
      : [];
  const fallback =
    field.allOptionsKey && ctx?.fieldOptions?.[field.allOptionsKey]
      ? ctx.fieldOptions[field.allOptionsKey]
      : [];
  return { primary, fallback };
}

export function buildOptionPool(groups: SelectOptionGroups): SelectOption[] {
  return [...(groups.primary || []), ...(groups.fallback || [])];
}

export function resolveOptionLabel(
  valueStr: string | null,
  pool: SelectOption[]
): string {
  if (valueStr == null) return "";
  const hit = pool.find((o) => o.value === valueStr);
  return hit?.label || valueStr;
}
