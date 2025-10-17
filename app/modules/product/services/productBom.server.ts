import { prismaBase } from "~/utils/prisma.server";

export type BomUpdate = {
  id: number;
  quantity?: number;
  activityUsed?: string | null;
};
export type BomCreate = {
  childSku: string;
  quantity?: number;
  activityUsed?: string | null;
};

export async function applyBomBatch(
  parentId: number,
  updates: BomUpdate[],
  creates: BomCreate[],
  deletes: number[]
) {
  const skuSet = new Set<string>();
  for (const c of creates)
    if (c.childSku) skuSet.add(String(c.childSku).trim());
  const skuArr = Array.from(skuSet).filter(Boolean);
  const children = skuArr.length
    ? await prismaBase.product.findMany({
        where: { sku: { in: skuArr } },
        select: { id: true, sku: true },
      })
    : [];
  const idBySku = new Map(children.map((c) => [c.sku, c.id]));
  const createData: any[] = [];
  const unknownSkus: string[] = [];
  for (const c of creates) {
    const sku = c.childSku?.trim();
    if (!sku) continue;
    const childId = idBySku.get(sku);
    if (!childId) {
      unknownSkus.push(sku);
      continue;
    }
    createData.push({
      parentId,
      childId,
      quantity: Number(c.quantity ?? 0) || 0,
      activityUsed: c.activityUsed || null,
    });
  }
  const updateData = updates
    .filter((u) => Number.isFinite(u.id))
    .map((u) => ({
      id: Number(u.id),
      data: {
        ...(u.quantity !== undefined
          ? { quantity: Number(u.quantity) || 0 }
          : {}),
        activityUsed:
          u.activityUsed === undefined ? undefined : u.activityUsed || null,
      },
    }));
  const results = await prismaBase.$transaction(async (tx) => {
    const created: any[] = [];
    if (createData.length) {
      for (const cd of createData) {
        const r = await tx.productLine.create({ data: cd });
        created.push(r);
      }
    }
    let updatedCount = 0;
    for (const upd of updateData) {
      if (!upd || Object.keys(upd.data).length === 0) continue;
      // Use updateMany scoped by parentId to avoid P2025 if the id was removed/replaced upstream
      const res = await tx.productLine.updateMany({
        where: { id: upd.id, parentId },
        data: upd.data,
      });
      if (res.count > 0) updatedCount++;
    }
    let deletedCount = 0;
    if (deletes.length) {
      await tx.productLine.deleteMany({
        where: { id: { in: deletes }, parentId },
      });
      deletedCount = deletes.length;
    }
    return {
      created: created.length,
      updated: updatedCount,
      deleted: deletedCount,
    };
  });
  return { ok: true, ...results, unknownSkus } as const;
}
