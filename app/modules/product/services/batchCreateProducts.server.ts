import { prismaBase } from "~/utils/prisma.server";

export type BatchCreateRow = Record<string, any>;

export type BatchCreateResult = {
  ok: true;
  created: number;
  errors: Array<{ index: number; message: string }>;
};

// Create many products from a grid-like array of rows.
// Each row may contain: sku, name, type, supplierId, categoryId, purchaseTaxId,
// costPrice, manualSalePrice, stockTrackingEnabled, batchTrackingEnabled
export async function batchCreateProducts(
  rows: BatchCreateRow[]
): Promise<BatchCreateResult> {
  const errors: Array<{ index: number; message: string }> = [];
  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const blank =
      !r ||
      Object.values(r).every((v) => v === null || v === undefined || v === "");
    if (blank) continue;
    try {
      const data: any = {};
      const str = (k: string) => {
        const v = r[k];
        if (v === undefined || v === null || v === "") return;
        data[k] = String(v).trim();
      };
      const num = (k: string) => {
        const v = r[k];
        if (v === undefined || v === null || v === "") return;
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`Invalid number for ${k}`);
        data[k] = n;
      };
      const bool = (k: string) => {
        const v = r[k];
        if (v === undefined || v === null || v === "") return;
        const s = String(v).toLowerCase();
        data[k] = s === "true" || s === "1" || s === "yes";
      };
      str("sku");
      str("name");
      str("type");
      num("supplierId");
      num("categoryId");
      num("purchaseTaxId");
      num("costPrice");
      num("manualSalePrice");
      bool("stockTrackingEnabled");
      bool("batchTrackingEnabled");
      await prismaBase.product.create({ data });
      created++;
    } catch (e: any) {
      const msg = e?.message || "Create failed";
      errors.push({ index: i, message: msg });
    }
  }
  return { ok: true, created, errors };
}
