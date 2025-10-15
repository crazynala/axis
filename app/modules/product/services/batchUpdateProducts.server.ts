import { prismaBase, runWithDbActivity } from "~/utils/prisma.server";

type Patch = {
  name?: string | null;
  type?: string | null;
  supplierId?: number | null;
  categoryId?: number | null;
  purchaseTaxId?: number | null;
  costPrice?: number | null;
  manualSalePrice?: number | null;
  stockTrackingEnabled?: boolean | null;
  batchTrackingEnabled?: boolean | null;
};

export async function batchUpdateProducts(ids: number[], patch: Patch) {
  return runWithDbActivity("products.batchUpdate", async () => {
    const allowed: (keyof Patch)[] = [
      "name",
      "type",
      "supplierId",
      "categoryId",
      "purchaseTaxId",
      "costPrice",
      "manualSalePrice",
      "stockTrackingEnabled",
      "batchTrackingEnabled",
    ];
    const data: Record<string, any> = {};
    for (const k of allowed) {
      if (k in patch) data[k] = (patch as any)[k];
    }
    if (!ids.length || Object.keys(data).length === 0) {
      return {
        ok: false,
        updated: 0,
        errors: [{ message: "No ids or fields" }],
      };
    }
    try {
      const res = await prismaBase.product.updateMany({
        where: { id: { in: ids } },
        data,
      });
      return { ok: true, updated: res.count };
    } catch (e: any) {
      return {
        ok: false,
        updated: 0,
        errors: [{ message: e?.message || "Update failed" }],
      };
    }
  });
}
