import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, fixMojibake } from "./utils";

export async function importProductCostRanges(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "a_Serial", "id", "RangeID"])) as
      | number
      | null;
    if (id == null) {
      skipped++;
      continue;
    }
    const productId = asNum(
      pick(r, ["productId", "ProductID", "a_ProductCode"])
    ) as number | null;
    const costGroupId = asNum(
      pick(r, ["costGroupId", "GroupID", "a_ProductCostGroupId"])
    ) as number | null;
    const costGroupNameRaw = pick(r, [
      "costGroupName",
      "group_name",
      "groupName",
      "GroupName",
    ]);
    const costGroupName = costGroupNameRaw
      ? fixMojibake(String(costGroupNameRaw || "").trim())
      : null;
    const supplierId = asNum(
      pick(r, ["supplierId", "SupplierID", "a_CompanyID"])
    ) as number | null;
    const costPrice = asNum(pick(r, ["costPrice", "Cost", "Price|Cost"])) as
      | number
      | null;
    const sellPriceManual = asNum(pick(r, ["sellPriceManual", "Sell"])) as
      | number
      | null;
    const rangeFrom = asNum(pick(r, ["rangeFrom", "From", "QtyFrom"])) as
      | number
      | null;
    const rangeTo = asNum(pick(r, ["rangeTo", "To", "QtyTo"])) as number | null;

    // Enforce invariant: exactly one of productId or costGroupId must be set
    const hasProduct = productId != null;
    const hasGroup = costGroupId != null;
    if (hasProduct === hasGroup) {
      skipped++;
      console.warn("[import] cost_ranges skipped invalid linkage", {
        index: i,
        id,
        productId,
        costGroupId,
      });
      errors.push({
        index: i,
        id,
        message: "Exactly one of productId or costGroupId must be provided",
        code: "INVALID_LINKAGE",
      });
      continue;
    }

    try {
      // Foreign key validation and optional resolution
      if (hasProduct) {
        const p = await prisma.product.findUnique({
          where: { id: productId! },
        });
        if (!p) {
          skipped++;
          const msg = `Missing Product FK: productId=${productId}`;
          console.warn("[import] cost_ranges skipped", {
            index: i,
            id,
            message: msg,
          });
          errors.push({ index: i, id, message: msg, code: "FK_NOT_FOUND" });
          continue;
        }
      }

      let resolvedCostGroupId = costGroupId as number | null;
      if (hasGroup) {
        let group = resolvedCostGroupId
          ? await prisma.productCostGroup.findUnique({
              where: { id: resolvedCostGroupId },
            })
          : null;
        // Try resolving by name (and optional supplier) if id lookup failed
        if (!group && costGroupName) {
          group = await prisma.productCostGroup.findFirst({
            where: {
              name: costGroupName,
              ...(supplierId != null ? { supplierId } : {}),
            },
          });
          if (group) resolvedCostGroupId = group.id;
        }
        if (!group) {
          skipped++;
          const msg = `Missing ProductCostGroup FK: costGroupId=${
            costGroupId ?? "null"
          }${costGroupName ? ` name="${costGroupName}"` : ""}`;
          console.warn("[import] cost_ranges skipped", {
            index: i,
            id,
            message: msg,
          });
          errors.push({ index: i, id, message: msg, code: "FK_NOT_FOUND" });
          continue;
        }
      }

      const existing = await prisma.productCostRange.findUnique({
        where: { id },
      });
      const data: any = { costPrice, sellPriceManual, rangeFrom, rangeTo };
      if (hasProduct) data.productId = productId;
      if (hasGroup) data.costGroupId = resolvedCostGroupId;
      if (existing) {
        await prisma.productCostRange.update({ where: { id }, data });
        updated++;
      } else {
        await prisma.productCostRange.create({ data: { id, ...data } });
        created++;
      }
    } catch (e: any) {
      console.error("[import] cost_ranges ERROR", {
        index: i,
        id,
        code: e?.code,
        message: e?.message,
        meta: e?.meta,
      });
      errors.push({ index: i, id, message: e?.message, code: e?.code });
    }
  }
  return { created, updated, skipped, errors } as ImportResult;
}
