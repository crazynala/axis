import type { Prisma } from "@prisma/client";
import type {
  ProductAttributeDefinition,
  ProductAttributeDataType,
} from "~/modules/productMetadata/types/productMetadata";
import { metaFieldName } from "~/modules/productMetadata/utils/productMetadataFields";

function buildValueClause(
  def: ProductAttributeDefinition,
  opts: {
    value?: string | null;
    min?: number | null;
    max?: number | null;
    bool?: boolean | null;
  }
) {
  const base: any = { definitionId: def.id };
  switch (def.dataType) {
    case "NUMBER": {
      const gteRaw = opts.min != null ? Number(opts.min) : null;
      const lteRaw = opts.max != null ? Number(opts.max) : null;
      const eqRaw = opts.value != null ? Number(opts.value) : null;
      const gte = Number.isFinite(gteRaw as number) ? gteRaw : null;
      const lte = Number.isFinite(lteRaw as number) ? lteRaw : null;
      const eq = Number.isFinite(eqRaw as number) ? eqRaw : null;
      if (eq != null) {
        base.valueNumber = { equals: eq };
      } else if (gte != null || lte != null) {
        base.valueNumber = {
          ...(gte != null ? { gte } : {}),
          ...(lte != null ? { lte } : {}),
        };
      } else {
        return null;
      }
      return base;
    }
    case "BOOLEAN": {
      if (opts.bool == null && opts.value == null) return null;
      const boolVal =
        opts.bool != null
          ? opts.bool
          : String(opts.value).toLowerCase() === "true";
      base.valueBool = { equals: boolVal };
      return base;
    }
    case "ENUM": {
      if (!opts.value) return null;
      base.valueString = { equals: String(opts.value) };
      return base;
    }
    case "JSON": {
      if (!opts.value) return null;
      base.valueString = { contains: String(opts.value), mode: "insensitive" };
      return base;
    }
    case "STRING":
    default: {
      if (!opts.value) return null;
      base.valueString = { contains: String(opts.value), mode: "insensitive" };
      return base;
    }
  }
}

export function buildMetadataWhereFromParams(
  params: URLSearchParams,
  defs: ProductAttributeDefinition[]
) {
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const perKey: Record<
    string,
    { value?: string | null; min?: number | null; max?: number | null; bool?: boolean | null }
  > = {};
  for (const [key, raw] of params.entries()) {
    if (!key.startsWith("meta__")) continue;
    const name = key.slice("meta__".length);
    const isMin = name.endsWith("Min");
    const isMax = name.endsWith("Max");
    const defKey = isMin || isMax ? name.slice(0, -3) : name;
    const def = defByKey.get(defKey);
    if (!def) continue;
    const entry = (perKey[defKey] ||= {});
    if (isMin) {
      const n = raw ? Number(raw) : null;
      entry.min = Number.isFinite(n as number) ? n : null;
    } else if (isMax) {
      const n = raw ? Number(raw) : null;
      entry.max = Number.isFinite(n as number) ? n : null;
    } else if (def.dataType === "BOOLEAN") {
      if (raw === "true" || raw === "false") {
        entry.bool = raw === "true";
      } else {
        entry.value = raw || null;
      }
    } else {
      entry.value = raw || null;
    }
  }
  const clauses = Object.entries(perKey)
    .map(([defKey, data]) => {
      const def = defByKey.get(defKey);
      if (!def) return null;
      const clause = buildValueClause(def, data);
      if (!clause) return null;
      return { attributeValues: { some: clause } } as Prisma.ProductWhereInput;
    })
    .filter(Boolean) as Prisma.ProductWhereInput[];
  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

export function buildMetadataInterpreters(
  defs: ProductAttributeDefinition[]
): Record<string, (val: any) => Prisma.ProductWhereInput | null> {
  const interpreters: Record<string, (val: any) => Prisma.ProductWhereInput | null> = {};
  for (const def of defs) {
    const name = metaFieldName(def.key);
    interpreters[name] = (val) => {
      const clause = buildValueClause(def, { value: val ?? null });
      if (!clause) return null;
      return { attributeValues: { some: clause } } as Prisma.ProductWhereInput;
    };
    if (def.dataType === "NUMBER") {
      interpreters[`${name}Min`] = (val) => {
        const n = val != null ? Number(val) : null;
        const clause = buildValueClause(def, {
          min: Number.isFinite(n as number) ? n : null,
        });
        if (!clause) return null;
        return { attributeValues: { some: clause } } as Prisma.ProductWhereInput;
      };
      interpreters[`${name}Max`] = (val) => {
        const n = val != null ? Number(val) : null;
        const clause = buildValueClause(def, {
          max: Number.isFinite(n as number) ? n : null,
        });
        if (!clause) return null;
        return { attributeValues: { some: clause } } as Prisma.ProductWhereInput;
      };
    }
  }
  return interpreters;
}
