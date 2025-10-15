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
  stockTrackingEnabled?: boolean | string | "";
  batchTrackingEnabled?: boolean | string | "";
};

export async function batchSaveProductRows(rows: SheetRow[]) {
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
        stockTrackingEnabled: toBooleanOrNull(r.stockTrackingEnabled),
        batchTrackingEnabled: toBooleanOrNull(r.batchTrackingEnabled),
      };
      try {
        const idNum = toNumberOrNull(r.id);
        if (idNum) {
          await prismaBase.product.update({ where: { id: idNum }, data });
          updated++;
        } else {
          // Require SKU and Name for new rows
          if (!data.sku || !data.name) {
            errors.push({ index: i, message: "Missing SKU or Name" });
            continue;
          }
          await prismaBase.product.create({ data });
          created++;
        }
      } catch (e: any) {
        errors.push({ index: i, message: e?.message || "Save failed" });
      }
    }
    return { ok: true, created, updated, errors };
  });
}
