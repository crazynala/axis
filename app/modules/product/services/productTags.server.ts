import { prismaBase } from "~/utils/prisma.server";

export async function replaceProductTagsByNames(
  productId: number,
  names: string[],
  userId?: number
) {
  // Delegate to existing tags utility if available; otherwise inline minimal logic
  const { replaceProductTags } = await import("~/utils/tags.server");
  await replaceProductTags(productId, names, userId ?? 0);
  return { ok: true } as const;
}
