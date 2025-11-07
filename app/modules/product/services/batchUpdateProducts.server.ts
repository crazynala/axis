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
    // Build data object, excluding undefined (allow null to intentionally clear)
    const data: Record<string, any> = {};
    for (const k of allowed) {
      if (k in patch) {
        const v = (patch as any)[k];
        if (v !== undefined) data[k] = v;
      }
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
      // If updateMany didn't touch all records, fall back to per-id updates to ensure completeness
      if (ids.length > 1 && res.count !== ids.length) {
        let updated = 0;
        const errors: Array<{ message: string }> = [];
        await prismaBase.$transaction(async (tx) => {
          for (const id of ids) {
            try {
              const r = await tx.product.update({ where: { id }, data });
              if (r) updated++;
            } catch (e: any) {
              errors.push({
                message: e?.message || `Update failed for id ${id}`,
              });
            }
          }
        });
        return {
          ok: errors.length === 0,
          updated,
          errors: errors.length ? errors : undefined,
        } as any;
      }
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
