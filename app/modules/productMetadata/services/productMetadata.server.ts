import { prisma } from "~/utils/prisma.server";
import type {
  ProductAttributeDefinition,
  ProductAttributeDataType,
} from "~/modules/productMetadata/types/productMetadata";

const CACHE_TTL_MS = 60_000;
let cacheAll: { at: number; value: ProductAttributeDefinition[] } | null = null;
let cacheFilterable: { at: number; value: ProductAttributeDefinition[] } | null =
  null;

function isFresh(entry: { at: number } | null) {
  return Boolean(entry && Date.now() - entry.at < CACHE_TTL_MS);
}

function normalizeDefs(rows: any[]): ProductAttributeDefinition[] {
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    dataType: row.dataType as ProductAttributeDataType,
    isRequired: Boolean(row.isRequired),
    isFilterable: Boolean(row.isFilterable),
    enumOptions: row.enumOptions ?? null,
    validation: row.validation ?? null,
    appliesToProductTypes: Array.isArray(row.appliesToProductTypes)
      ? row.appliesToProductTypes
      : [],
    sortOrder: Number(row.sortOrder ?? 0) || 0,
  }));
}

export async function getAllProductAttributeDefinitions() {
  if (isFresh(cacheAll)) return cacheAll!.value;
  const rows = await prisma.productAttributeDefinition.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const defs = normalizeDefs(rows);
  cacheAll = { at: Date.now(), value: defs };
  return defs;
}

export async function getFilterableProductAttributeDefinitions() {
  if (isFresh(cacheFilterable)) return cacheFilterable!.value;
  const rows = await prisma.productAttributeDefinition.findMany({
    where: { isFilterable: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const defs = normalizeDefs(rows);
  cacheFilterable = { at: Date.now(), value: defs };
  return defs;
}

export function invalidateProductAttributeCache() {
  cacheAll = null;
  cacheFilterable = null;
}
