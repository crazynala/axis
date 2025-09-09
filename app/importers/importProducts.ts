import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asBool, asNum, pick } from "./utils";

export async function importProducts(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skippedNoId = 0,
    skuRenamed = 0,
    missingVariantSet = 0,
    linkedVariantSet = 0,
    linkedCustomer = 0,
    missingCustomer = 0;
  const errors: any[] = [];

  const getUniqueSku = async (
    desired: string | null,
    currentId?: number | null
  ): Promise<string | null> => {
    const base = (desired || "").trim();
    if (!base) return null;
    let candidate = base;
    let n = 1;
    while (true) {
      const clash = await prisma.product.findFirst({
        where: { sku: candidate },
      });
      if (!clash || (currentId != null && clash.id === currentId))
        return candidate;
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
        .trim() || null;
    const typeRaw = (pick(r, ["type", "product_type", "product type"]) ?? "")
      .toString()
      .trim();
    const allowedTypes = ["CMT", "Fabric", "Finished", "Trim", "Service"];
    const type =
      allowedTypes.find((t) => t.toLowerCase() === typeRaw.toLowerCase()) ||
      (typeRaw.toLowerCase() === "finished goods" ? "Finished" : null);
    const costPrice = asNum(
      pick(r, [
        "Price",
        "price",
        "Cost",
        "cost",
        "costprice",
        "cost price",
        "cost_price",
        "unit cost",
      ])
    ) as number | null;
    const manualSalePrice = asNum(
      pick(r, [
        "manualsaleprice",
        "manual sale price",
        "manual_sale_price",
        "manual",
        "manual price",
      ])
    ) as number | null;
    const autoSalePrice = asNum(
      pick(r, [
        "autosaleprice",
        "auto sale price",
        "auto_sale_price",
        "auto",
        "auto price",
      ])
    ) as number | null;
    const stockTrackingEnabled = !!asBool(
      pick(r, [
        "stocktrackingenabled",
        "stock tracking enabled",
        "stock_tracking_enabled",
        "stock tracking",
        "stock",
      ])
    );
    const batchTrackingEnabled = !!asBool(
      pick(r, [
        "batchtrackingenabled",
        "batch tracking enabled",
        "batch_tracking_enabled",
        "batch tracking",
        "batch",
      ])
    );
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
    const supplierIdRaw = asNum(pick(r, ["a_CompanyID"])) as number | null;
    const supplierName = (pick(r, ["Supplier"]) ?? "").toString().trim();
    let resolvedSupplierId: number | null = null;
    if (supplierIdRaw != null) {
      const s = await prisma.company.findUnique({
        where: { id: supplierIdRaw },
      });
      if (s) {
        resolvedSupplierId = s.id;
        linkedCustomer++; // reuse counter for linkage success
      } else missingCustomer++;
    } else if (supplierName) {
      const s = await prisma.company.findFirst({
        where: { name: supplierName },
      });
      if (s) {
        resolvedSupplierId = s.id;
        linkedCustomer++;
      } else missingCustomer++;
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
      const uniqueSku = await getUniqueSku(sku, existing?.id ?? null);
      if (uniqueSku !== (sku ?? null)) skuRenamed++;
      const data: any = {
        sku: uniqueSku,
        name,
        type: type as any,
        costPrice,
        manualSalePrice,
        autoSalePrice,
        stockTrackingEnabled,
        batchTrackingEnabled,
        ...(resolvedVariantSetId != null
          ? { variantSetId: resolvedVariantSetId }
          : {}),
        ...(resolvedSupplierId != null
          ? { supplierId: resolvedSupplierId }
          : {}),
        ...(resolvedPurchaseTaxId != null
          ? { purchaseTaxId: resolvedPurchaseTaxId }
          : {}),
        ...(resolvedCategoryId != null
          ? { categoryId: resolvedCategoryId }
          : {}),
      };
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.product.create({ data: { id: idNum, ...data } as any });
        created++;
      }
    } catch (e: any) {
      errors.push({
        index: i,
        id: idNum,
        sku,
        message: e?.message,
        code: e?.code,
      });
    }
  }
  return {
    created,
    updated,
    skipped: skippedNoId,
    errors,
  } as any;
}
