import { prismaBase, runWithDbActivity } from "~/utils/prisma.server";

type SheetRow = {
  id?: number | string | "";
  sku?: string;
  name?: string;
  type?: string;
  supplierId?: number | string | "";
  categoryId?: number | string | "";
  purchaseTaxId?: number | string | "";
  costPrice?: number | string | "";
  manualSalePrice?: number | string | "";
  pricingModel?: string | null;
  pricingSpecId?: number | string | "";
  moqPrice?: number | string | "";
  margin?: number | string | "";
  transferPct?: number | string | "";
  stockTrackingEnabled?: boolean | string | "";
  batchTrackingEnabled?: boolean | string | "";
  [key: string]: any;
};

export async function batchSaveProductRows(rows: SheetRow[]) {
  console.log("!!! Batch save rows", rows);
  return runWithDbActivity("products.batchSaveRows", async () => {
    const cleanText = (v: any) => {
      if (v === undefined || v === null) return null;
      if (typeof v === "string") {
        const t = v.trim();
        return t === "" ? null : t;
      }
      return v;
    };
    const toNumberOrNull = (v: any): number | null => {
      if (v === undefined || v === null || v === "") return null;
      if (typeof v === "number") return isNaN(v) ? null : v;
      const n = Number((v as string).trim());
      return isNaN(n) ? null : n;
    };
    const toBooleanOrNull = (v: any): boolean | null => {
      if (v === undefined || v === null || v === "") return null;
      if (typeof v === "boolean") return v;
      const s = String(v).toLowerCase().trim();
      if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
      if (s === "false" || s === "0" || s === "no" || s === "n") return false;
      return !!v;
    };
    const isEmpty = (v: any) =>
      v === undefined || v === null || v === "" || v === "null";

    const metadataDefinitions = await prismaBase.productAttributeDefinition.findMany({
      select: {
        id: true,
        key: true,
        dataType: true,
      },
    });
    const metaKeyByDefinition = new Map(
      metadataDefinitions.map((def) => [def.key, def])
    );
    const metaPrefix = "meta:";

    let created = 0;
    let updated = 0;
    const errors: Array<{ index: number; message: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const data: any = {
        sku: cleanText(r.sku),
        name: cleanText(r.name),
        type: cleanText(r.type),
        supplierId: toNumberOrNull(r.supplierId),
        categoryId: toNumberOrNull(r.categoryId),
        purchaseTaxId: toNumberOrNull(r.purchaseTaxId),
        costPrice: toNumberOrNull(r.costPrice) as any,
        manualSalePrice: toNumberOrNull(r.manualSalePrice) as any,
        pricingModel: cleanText(r.pricingModel),
        pricingSpecId: toNumberOrNull(r.pricingSpecId),
        baselinePriceAtMoq: toNumberOrNull(r.moqPrice) as any,
        manualMargin: toNumberOrNull(r.margin) as any,
        transferPercent: toNumberOrNull(r.transferPct) as any,
        stockTrackingEnabled: toBooleanOrNull(r.stockTrackingEnabled),
        batchTrackingEnabled: toBooleanOrNull(r.batchTrackingEnabled),
      };
      try {
        const idNum = toNumberOrNull(r.id);
        let productId = idNum ?? null;
        if (idNum) {
          console.log("!!! Updating product", idNum, data);
          await prismaBase.product.update({ where: { id: idNum }, data });
          updated++;
        } else {
          // Require SKU and Name for new rows
          if (!data.sku || !data.name) {
            errors.push({ index: i, message: "Missing SKU or Name" });
            continue;
          }
          const createdRow = await prismaBase.product.create({ data });
          productId = createdRow.id;
          created++;
        }
        if (!productId) continue;
        const metaEntries = Object.entries(r).filter(([key]) =>
          key.startsWith(metaPrefix)
        );
        for (const [metaKey, raw] of metaEntries) {
          const defKey = metaKey.slice(metaPrefix.length);
          const def = metaKeyByDefinition.get(defKey);
          if (!def) continue;
          const dataType = def.dataType;
          if (dataType === "JSON") continue;
          if (isEmpty(raw)) {
            await prismaBase.productAttributeValue.deleteMany({
              where: { productId, definitionId: def.id },
            });
            continue;
          }
          const payload: any = {
            productId,
            definitionId: def.id,
            optionId: null,
            valueString: null,
            valueNumber: null,
            valueBool: null,
            valueJson: null,
          };
          if (dataType === "NUMBER") {
            payload.valueNumber = toNumberOrNull(raw);
          } else if (dataType === "BOOLEAN") {
            payload.valueBool = toBooleanOrNull(raw);
          } else if (dataType === "ENUM") {
            const num = toNumberOrNull(raw);
            if (num) payload.optionId = num;
            else payload.valueString = cleanText(raw);
          } else {
            payload.valueString = cleanText(raw);
          }
          await prismaBase.productAttributeValue.upsert({
            where: {
              productId_definitionId: {
                productId,
                definitionId: def.id,
              },
            },
            create: payload,
            update: payload,
          });
        }
      } catch (e: any) {
        errors.push({ index: i, message: e?.message || "Save failed" });
      }
    }
    return { ok: true, created, updated, errors };
  });
}
