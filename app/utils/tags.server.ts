import { prismaBase } from "./prisma.server";

export type TagScope = "GLOBAL" | "USER";

export type TagDef = {
  id: number;
  name: string;
  scope: TagScope;
  ownerId: number | null;
  color: string | null;
};

function normName(name: string): string {
  return name.trim();
}

/** List tags visible to a user (GLOBAL or owned by the user). Optional q filter by name substring. */
export async function listVisibleTags(userId: number, q?: string): Promise<TagDef[]> {
  const where: any = {
    OR: [{ scope: "GLOBAL" }, { scope: "USER", ownerId: userId }],
  };
  if (q && q.trim()) {
    where.name = { contains: q.trim(), mode: "insensitive" };
  }
  const rows = await prismaBase.tagDefinition.findMany({
    where,
    orderBy: [{ scope: "asc" }, { name: "asc" }],
    select: { id: true, name: true, scope: true, ownerId: true, color: true },
  } as any);
  return rows as TagDef[];
}

/** Ensure tag definitions exist for the given names. Prefers existing GLOBAL, then USER-owned. Creates USER tags for missing. Returns id map by name. */
export async function ensureDefinitionsByNames(userId: number, names: string[]): Promise<Map<string, number>> {
  const uniqueNames = Array.from(new Set(names.map(normName))).filter(Boolean);
  if (uniqueNames.length === 0) return new Map();
  // Load existing GLOBAL and current-user USER tags with matching names
  const existing = await prismaBase.tagDefinition.findMany({
    where: {
      name: { in: uniqueNames },
      OR: [{ scope: "GLOBAL" }, { scope: "USER", ownerId: userId }],
    },
    select: { id: true, name: true, scope: true, ownerId: true },
  } as any);
  const idByName = new Map<string, number>();
  // Prefer GLOBAL if both exist
  for (const n of uniqueNames) {
    const matches = existing.filter((e) => e.name === n);
    const global = matches.find((e) => e.scope === "GLOBAL");
    const mine = matches.find((e) => e.scope === "USER" && e.ownerId === userId);
    if (global) idByName.set(n, global.id);
    else if (mine) idByName.set(n, mine.id);
  }
  const toCreate = uniqueNames.filter((n) => !idByName.has(n));
  if (toCreate.length) {
    const created = await prismaBase.$transaction(async (tx) => {
      const results: Array<{ id: number; name: string }> = [];
      for (const name of toCreate) {
        const r = await tx.tagDefinition.create({
          data: { name, scope: "USER", ownerId: userId },
          select: { id: true, name: true },
        } as any);
        results.push(r);
      }
      return results;
    });
    for (const r of created) idByName.set(r.name, r.id);
  }
  return idByName;
}

/** Replace tags on a product with the provided names (set semantics). Creates USER tags for unknown names. */
export async function replaceProductTags(productId: number, names: string[], userId: number) {
  const clean = Array.from(new Set(names.map(normName))).filter(Boolean);
  const idByName = await ensureDefinitionsByNames(userId, clean);
  const desiredTagIds = new Set<number>(clean.map((n) => idByName.get(n)!).filter((v): v is number => Number.isFinite(v)));
  await prismaBase.$transaction(async (tx) => {
    const existing = await tx.productTag.findMany({
      where: { productId },
      select: { id: true, tagId: true },
    } as any);
    const existingIds = new Set(existing.map((e) => e.tagId));
    const toAdd = Array.from(desiredTagIds).filter((tid) => !existingIds.has(tid));
    const toRemove = existing.filter((e) => !desiredTagIds.has(e.tagId)).map((e) => e.id);
    if (toRemove.length) await tx.productTag.deleteMany({ where: { id: { in: toRemove } } } as any);
    if (toAdd.length) {
      for (const tagId of toAdd) {
        await tx.productTag.create({ data: { productId, tagId } } as any);
      }
    }
  });
}
