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
    appliesToCategoryIds: Array.isArray(row.appliesToCategoryIds)
      ? row.appliesToCategoryIds
      : [],
    appliesToSubcategoryIds: Array.isArray(row.appliesToSubcategoryIds)
      ? row.appliesToSubcategoryIds
      : [],
    displayWidth: row.displayWidth ?? "full",
    options: Array.isArray(row.options)
      ? row.options.map((opt: any) => ({
          id: opt.id,
          definitionId: opt.definitionId,
          label: opt.label,
          slug: opt.slug,
          isArchived: Boolean(opt.isArchived),
          mergedIntoId: opt.mergedIntoId ?? null,
        }))
      : [],
    sortOrder: Number(row.sortOrder ?? 0) || 0,
  }));
}

export async function getAllProductAttributeDefinitions() {
  if (isFresh(cacheAll)) return cacheAll!.value;
  const rows = await prisma.productAttributeDefinition.findMany({
    include: {
      options: {
        where: { isArchived: false, mergedIntoId: null },
        orderBy: { label: "asc" },
      },
    },
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
    include: {
      options: {
        where: { isArchived: false, mergedIntoId: null },
        orderBy: { label: "asc" },
      },
    },
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
