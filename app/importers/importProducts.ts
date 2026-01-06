import { ProductType, ExternalStepType } from "@prisma/client";
import { resolvePricingModelForImport } from "../modules/product/services/pricingModel.server";
import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asBool, asNum, pick, fixMojibake, resetSequence } from "./utils";

type CategoryKey = `${string}::${string}`;
type SubCategoryKey = `${string}::${string}::${string}`;
type ImportWarning = { id: number; sku: string | null; reason: string };

function normalizeCode(raw: unknown): string {
  return (raw ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

async function buildCategoryCache() {
  const rows = await prisma.valueList.findMany({
    where: { type: "Category" },
    select: {
      id: true,
      code: true,
      parentId: true,
      parent: {
        select: {
          id: true,
          code: true,
          parent: { select: { code: true } },
        },
      },
    },
  });

  const groupByCode = new Map<string, number>();
  const leafByKey = new Map<CategoryKey, number>();
  const subLeafByKey = new Map<SubCategoryKey, number>();
  const codeById = new Map<number, string>();

  for (const row of rows) {
    if (row.code) {
      codeById.set(row.id, row.code);
    }
    if (!row.parentId && row.code) {
      groupByCode.set(row.code, row.id);
    }
    if (row.parent?.code && row.code) {
      leafByKey.set(`${row.parent.code}::${row.code}`, row.id);
    }
    if (row.parent?.parent?.code && row.parent.code && row.code) {
      subLeafByKey.set(
        `${row.parent.parent.code}::${row.parent.code}::${row.code}`,
        row.id
      );
    }
  }

  return { groupByCode, leafByKey, subLeafByKey, codeById };
}

async function buildTemplateCache() {
  const templates = await prisma.productTemplate.findMany({
    select: { id: true, productType: true, defaultCategoryId: true },
  });
  const map = new Map<string, number>();
  for (const t of templates) {
    const key = `${t.productType}::${t.defaultCategoryId ?? "null"}`;
    map.set(key, t.id);
  }
  return map;
}

function resolveProductType(typeRaw: string): ProductType | null {
  const normalized = typeRaw.trim().toLowerCase();
  switch (normalized) {
    case "cmt":
      return ProductType.CMT;
    case "fabric":
      return ProductType.Fabric;
    case "finished":
    case "finished goods":
      return ProductType.Finished;
    case "trim":
    case "trims":
      return ProductType.Trim;
    case "service":
    case "services":
    case "fee":
    case "fees":
      return ProductType.Service;
    case "packaging":
    case "raw":
    case "raw packaging":
    case "packaging item":
      return ProductType.Packaging;
    default:
      return null;
  }
}

function deriveExternalStepTypeFromLeaf(
  leafCode: string | null | undefined
): ExternalStepType | null {
  switch (leafCode) {
    case "OUTSIDE_WASH":
      return ExternalStepType.WASH;
    case "OUTSIDE_DYE":
      return ExternalStepType.DYE;
    case "OUTSIDE_EMBROIDERY":
      return ExternalStepType.EMBROIDERY;
    default:
      return null;
  }
}

export async function importProducts(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skippedNoId = 0,
    skuRenamed = 0,
    missingVariantSet = 0,
    linkedVariantSet = 0,
    // new: track supplier and customer separately
    linkedSupplier = 0,
    missingSupplier = 0,
    linkedCustomer = 0,
    missingCustomer = 0,
    // new: track cost group linkage
    linkedCostGroup = 0,
    missingCostGroup = 0,
    appliedForeignCost = 0,
    skippedForeignDueToManual = 0;
  const errors: any[] = [];
  const toCreate: any[] = [];
  const warnings: ImportWarning[] = [];
  // Seed a set of used SKUs from the database to ensure per-batch uniqueness
  const usedSkus = new Set<string>();
  {
    const existingSkus = await prisma.product.findMany({
      select: { sku: true },
      where: { sku: { not: null } },
    });
    for (const r of existingSkus) {
      const s = (r.sku || "").trim();
      if (s) usedSkus.add(s);
    }
  }
  const categoryCache = await buildCategoryCache();
  const templateCache = await buildTemplateCache();
  const getUniqueSku = (
    desired: string | null,
    currentSku?: string | null
  ): string | null => {
    const base = (desired || "").trim();
    if (!base) return null;
    let candidate = base;
    let n = 1;
    while (true) {
      const available =
        candidate === (currentSku || null) || !usedSkus.has(candidate);
      if (available) {
        usedSkus.add(candidate);
        return candidate;
      }
      n += 1;
      candidate = n === 2 ? `${base}-dup` : `${base}-dup${n - 1}`;
    }
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(
      pick(r, [
        "a__ProductCode",
        "a_ProductCode",
        "ProductCode",
        "product_code",
        "product code",
        "productcode",
        "a__Serial",
        "a_Serial",
        "product_id",
        "productid",
        "id",
      ])
    ) as number | null;
    if (idNum == null) {
      skippedNoId++;
      continue;
    }
    const sku =
      (pick(r, ["SKU", "sku", "sku code"]) as any)?.toString().trim() || null;
    const name =
      fixMojibake(
        (
          pick(r, [
            "name",
            "product_name",
            "product name",
            "productname",
            "item name",
            "description",
            "product description",
          ]) ?? ""
        )
          .toString()
          .trim()
      ) || null;
    const typeRaw = (pick(r, ["type", "product_type", "product type"]) ?? "")
      .toString()
      .trim();
    const type = resolveProductType(typeRaw);
    const groupCode = type ? type.toString().toUpperCase() : "";
    // Base cost (may be overridden by foreign pricing rules below)
    const costPriceBase = asNum(pick(r, ["price|cost"])) as number | null;
    // Cost Group from FM linked table column
    const costGroupIdRaw = asNum(
      pick(r, [
        "Products_ProductSuppliers|Default_PRODUCTCOSTGROUPS::a__Serial",
      ])
    ) as number | null;
    let resolvedCostGroupId: number | null = null;
    if (costGroupIdRaw != null) {
      const g = await prisma.productCostGroup.findUnique({
        where: { id: costGroupIdRaw },
      });
      if (g) {
        resolvedCostGroupId = g.id;
        linkedCostGroup++;
      } else {
        missingCostGroup++;
      }
    }

    // Foreign pricing inputs from ProductSuppliers row
    const foreignCost = asNum(
      pick(r, ["Products_PRODUCTSUPPLIERS::Price|Cost|Foreign"]) as any
    ) as number | null;
    const foreignCurrencyRaw = (
      pick(r, ["Products_PRODUCTSUPPLIERS::Currency"]) ?? ""
    )
      .toString()
      .trim();
    const foreignCurrency = foreignCurrencyRaw
      ? foreignCurrencyRaw.toUpperCase()
      : "";
    const manualForexOverride = asNum(
      pick(r, ["Products_PRODUCTSUPPLIERS::Price|Cost|Manual"]) as any
    ) as number | null;
    // Derived cost/currency with rules:
    // - If foreignCost and currency exist and currency != USD and (no manual override OR currency == EUR),
    //   then set costPrice to foreignCost and costCurrency to currency.
    // - Prefer manual override except when currency is EUR (ignore override for EUR).
    let costPrice: number | null = costPriceBase;
    let costCurrency: string | null = null;
    if (
      foreignCost != null &&
      foreignCurrency &&
      foreignCurrency !== "USD" &&
      (manualForexOverride == null || foreignCurrency === "EUR")
    ) {
      costPrice = foreignCost;
      costCurrency = foreignCurrency;
      appliedForeignCost++;
    } else if (
      foreignCost != null &&
      foreignCurrency &&
      foreignCurrency !== "USD" &&
      manualForexOverride != null &&
      foreignCurrency !== "EUR"
    ) {
      // Explicitly recorded skip: manual override present for non-EUR => do not use foreign cost
      skippedForeignDueToManual++;
    }
    const manualSalePrice = asNum(
      pick(r, ["Products_PRODUCTPRICES::Price_Manual"])
    ) as number | null;
    const stockTrackingEnabled = !!asBool(pick(r, ["trackstock|flag"]));
    const batchTrackingEnabled = !!asBool(pick(r, ["trackstockbatches|flag"]));
    const variantSetIdVal = asNum(
      pick(r, [
        "a__VariantSetID",
        "a_VariantSetID",
        "variantsetid",
        "variant set id",
        "variant_set_id",
      ]) as any
    ) as number | null;
    let resolvedVariantSetId: number | null = null;
    if (variantSetIdVal != null) {
      const vs = await prisma.variantSet.findUnique({
        where: { id: variantSetIdVal },
      });
      if (vs) {
        resolvedVariantSetId = vs.id;
        linkedVariantSet++;
      } else missingVariantSet++;
    }
    // Resolve supplier id from numeric a_CompanyID or Supplier name
    const supplierIdRaw = asNum(pick(r, ["a_CompanyID|Supplier"])) as
      | number
      | null;
    const supplierName = fixMojibake(
      (pick(r, ["Supplier"]) ?? "").toString().trim()
    );
    let resolvedSupplierId: number | null = null;
    if (supplierIdRaw != null) {
      const s = await prisma.company.findUnique({
        where: { id: supplierIdRaw },
      });
      if (s) {
        resolvedSupplierId = s.id;
        linkedSupplier++;
      } else {
        missingSupplier++;
      }
    } else if (supplierName) {
      const s = await prisma.company.findFirst({
        where: { name: supplierName },
      });
      if (s) {
        resolvedSupplierId = s.id;
        linkedSupplier++;
      } else {
        missingSupplier++;
      }
    }

    // new: Resolve customer id from numeric a_CompanyID|Customer or Customer name
    const customerIdRaw = asNum(pick(r, ["a_CompanyID|Customer"])) as
      | number
      | null;
    const customerName = fixMojibake(
      (pick(r, ["Customer"]) ?? "").toString().trim()
    );
    let resolvedCustomerId: number | null = null;
    if (customerIdRaw != null) {
      const c = await prisma.company.findUnique({
        where: { id: customerIdRaw },
      });
      if (c) {
        resolvedCustomerId = c.id;
        linkedCustomer++;
      } else {
        missingCustomer++;
      }
    } else if (customerName) {
      const c = await prisma.company.findFirst({
        where: { name: customerName },
      });
      if (c) {
        resolvedCustomerId = c.id;
        linkedCustomer++;
      } else {
        missingCustomer++;
      }
    }

    // Resolve purchase tax from string code or id-like value
    const purchaseTaxCodeRaw = (
      pick(r, [
        "purchaseTaxCode",
        "DefaultTaxCodePurchase",
        "purchaseTaxID",
        "purchase tax id",
        "tax code",
      ]) ?? ""
    )
      .toString()
      .trim();
    let resolvedPurchaseTaxId: number | null = null;
    if (purchaseTaxCodeRaw) {
      const codeLower = purchaseTaxCodeRaw.toLowerCase();
      const numericId = asNum(purchaseTaxCodeRaw) as number | null;
      const tax = await prisma.valueList.findFirst({
        where: {
          OR: [
            { id: numericId ?? -1 },
            { code: purchaseTaxCodeRaw },
            { label: purchaseTaxCodeRaw },
            { label: { equals: purchaseTaxCodeRaw, mode: "insensitive" } },
          ],
          type: "Tax",
        },
      });
      if (tax) resolvedPurchaseTaxId = tax.id;
    }

    // Resolve category from codes (preferred) or numeric id
    const categoryRawVal = pick(r, [
      "category",
      "Category",
      "categoryId",
      "category id",
    ]);
    const subCategoryRawVal = pick(r, ["subCategory", "SubCategory"]);
    let resolvedCategoryId: number | null = null;
    let resolvedSubCategoryId: number | null = null;
    const categoryCode = normalizeCode(categoryRawVal);
    const subCategoryCode = normalizeCode(subCategoryRawVal);
    const categoryKey =
      groupCode && categoryCode ? (`${groupCode}::${categoryCode}` as CategoryKey) : null;
    if (categoryKey) {
      resolvedCategoryId = categoryCache.leafByKey.get(categoryKey) ?? null;
    }
    if (resolvedCategoryId == null) {
      const numericId = asNum(categoryRawVal) as number | null;
      if (numericId != null) resolvedCategoryId = numericId;
    }
    if (groupCode && categoryCode && subCategoryCode) {
      const subKey = `${groupCode}::${categoryCode}::${subCategoryCode}` as SubCategoryKey;
      resolvedSubCategoryId = categoryCache.subLeafByKey.get(subKey) ?? null;
    }
    if (subCategoryRawVal && !resolvedSubCategoryId) {
      warnings.push({
        id: idNum,
        sku,
        reason: `unmapped subcategory "${subCategoryRawVal}" stored in notes`,
      });
    }

    const resolvedLeafCode =
      categoryCode || (resolvedCategoryId ? categoryCache.codeById.get(resolvedCategoryId) || "" : "");
    const derivedExternalStepType =
      type === ProductType.Service
        ? deriveExternalStepTypeFromLeaf(resolvedLeafCode)
        : null;

    const notesRaw = fixMojibake(
      (pick(r, ["notes", "Notes", "note"]) ?? "").toString().trim()
    );
    let notes = notesRaw || null;
    if (subCategoryRawVal && !resolvedSubCategoryId) {
      notes = [notes, `Unmapped subcategory: ${subCategoryRawVal}`]
        .filter(Boolean)
        .join(" | ");
    }

    const templateKey =
      type && resolvedCategoryId != null
        ? `${type}::${resolvedCategoryId}`
        : null;
    const templateId =
      templateKey && templateCache.has(templateKey)
        ? (templateCache.get(templateKey) as number)
        : null;
    if (
      type &&
      [ProductType.Fabric, ProductType.Trim, ProductType.Packaging].includes(
        type
      ) &&
      resolvedSupplierId == null
    ) {
      warnings.push({
        id: idNum,
        sku,
        reason: "missing supplier for supply product",
      });
    }
    if (
      type &&
      [ProductType.Finished, ProductType.CMT].includes(type) &&
      resolvedCustomerId == null
    ) {
      warnings.push({
        id: idNum,
        sku,
        reason: "missing customer for Finished/CMT product",
      });
    }
    if (
      type === ProductType.Service &&
      derivedExternalStepType &&
      resolvedSupplierId == null
    ) {
      warnings.push({
        id: idNum,
        sku,
        reason: "service with external step missing supplier",
      });
    }

    try {
      const existing = await prisma.product.findUnique({
        where: { id: idNum },
      });
      const uniqueSku = getUniqueSku(sku, existing?.sku ?? null);
      if (uniqueSku !== (sku ?? null)) skuRenamed++;
      const data: any = {
        sku: uniqueSku,
        name,
        type: type as any,
        costPrice,
        ...(costCurrency ? { costCurrency } : {}),
        manualSalePrice,
        pricingModel: resolvePricingModelForImport({
          type: type ? String(type) : null,
          manualSalePrice,
          costGroupId: resolvedCostGroupId,
        }),
        stockTrackingEnabled,
        batchTrackingEnabled,
        ...(resolvedVariantSetId != null
          ? { variantSetId: resolvedVariantSetId }
          : {}),
        ...(resolvedSupplierId != null
          ? { supplierId: resolvedSupplierId }
          : {}),
        // new: persist customerId separately
        ...(resolvedCustomerId != null
          ? { customerId: resolvedCustomerId }
          : {}),
        ...(resolvedPurchaseTaxId != null
          ? { purchaseTaxId: resolvedPurchaseTaxId }
          : {}),
        ...(resolvedCategoryId != null
          ? { categoryId: resolvedCategoryId }
          : {}),
        ...(resolvedSubCategoryId != null
          ? { subCategoryId: resolvedSubCategoryId }
          : {}),
        ...(templateId != null ? { templateId } : {}),
        ...(derivedExternalStepType
          ? { externalStepType: derivedExternalStepType }
          : {}),
        ...(resolvedCostGroupId != null
          ? { costGroupId: resolvedCostGroupId }
          : {}),
        ...(notes ? { notes } : {}),
      };
      if (existing) {
        // console.log(`[import] products update id=${idNum} sku=${uniqueSku} name=${name} type=${type} costPrice=${costPrice} costCurrency=${costCurrency}`);
        await prisma.product.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        // console.log("[import] products create", { idNum, ...data });
        toCreate.push({ id: idNum, ...data });
      }
    } catch (e: any) {
      // Minimal: log thrown errors with useful context
      console.error("[import] products ERROR", {
        index: i,
        id: idNum,
        sku,
        type,
        code: e?.code,
        message: e?.message,
        meta: e?.meta,
      });
      if (e?.stack) console.error(e.stack);
      errors.push({
        index: i,
        id: idNum,
        sku,
        message: e?.message,
        code: e?.code,
      });
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] products progress ${i + 1}/${
          rows.length
        } created=${created} updated=${updated} skipped=${skippedNoId} renamedSku=${skuRenamed} linkedCostGroup=${linkedCostGroup} missingCostGroup=${missingCostGroup} appliedForeignCost=${appliedForeignCost} skippedForeignDueToManual=${skippedForeignDueToManual} errors=${
          errors.length
        }`
      );
    }
  }
  if (toCreate.length) {
    try {
      const res = await prisma.product.createMany({
        data: toCreate as any[],
        skipDuplicates: true,
      });
      created += res.count;
    } catch (e: any) {
      errors.push({
        index: -1,
        id: null,
        code: e?.code,
        message: e?.message,
        note: `createMany failed for ${toCreate.length} products`,
      });
    }
  }
  console.log(
    `[import] products complete total=${rows.length} created=${created} updated=${updated} skipped=${skippedNoId} renamedSku=${skuRenamed} missingVariantSet=${missingVariantSet} linkedVariantSet=${linkedVariantSet} supplierLinked=${linkedSupplier} supplierMissing=${missingSupplier} customerLinked=${linkedCustomer} customerMissing=${missingCustomer} linkedCostGroup=${linkedCostGroup} missingCostGroup=${missingCostGroup} appliedForeignCost=${appliedForeignCost} skippedForeignDueToManual=${skippedForeignDueToManual} errors=${errors.length}`
  );
  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; samples: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, samples: [] };
      grouped[key].count++;
      if (grouped[key].samples.length < 5)
        grouped[key].samples.push(e.id ?? null);
    }
    console.log("[import] products error summary", Object.values(grouped));
  }
  if (warnings.length) {
    console.log("[import] products warnings (first 20)", warnings.slice(0, 20));
    console.log(
      `[import] warnings total=${warnings.length} (missing links or unmapped subcategories)`
    );
  }
  await resetSequence(prisma, "Product");
  return {
    created,
    updated,
    skipped: skippedNoId,
    errors,
  } as any;
}
