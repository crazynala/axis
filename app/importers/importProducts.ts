import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asBool, asNum, pick, fixMojibake } from "./utils";

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
    const allowedTypes = ["CMT", "Fabric", "Finished", "Trim", "Service"];
    const type =
      allowedTypes.find((t) => t.toLowerCase() === typeRaw.toLowerCase()) ||
      (typeRaw.toLowerCase() === "finished goods" ? "Finished" : null);
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

    // Resolve category from string code/label or numeric id
    const categoryRawVal = pick(r, [
      "category",
      "Category",
      "categoryId",
      "category id",
    ]);
    let resolvedCategoryId: number | null = null;
    if (categoryRawVal != null) {
      const label = (categoryRawVal ?? "").toString().trim();
      const numericId = asNum(categoryRawVal) as number | null;
      const cat = await prisma.valueList.findFirst({
        where: {
          OR: [
            { id: numericId ?? -1 },
            { code: label },
            { label },
            { label: { equals: label, mode: "insensitive" } },
          ],
          type: "Category",
        },
      });
      if (cat) resolvedCategoryId = cat.id;
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
        ...(resolvedCostGroupId != null
          ? { costGroupId: resolvedCostGroupId }
          : {}),
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
  return {
    created,
    updated,
    skipped: skippedNoId,
    errors,
  } as any;
}
