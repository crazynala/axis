import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { requireUserId } from "~/utils/auth.server";
import { invalidateProductAttributeCache } from "~/modules/productMetadata/services/productMetadata.server";

function slugifyLabel(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);
  if (request.method.toLowerCase() !== "post") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }
  const body = await request.json().catch(() => null);
  const definitionId = Number(body?.definitionId);
  const label = String(body?.label || "").trim();
  if (!Number.isFinite(definitionId)) {
    return json({ error: "definitionId is required." }, { status: 400 });
  }
  if (!label) {
    return json({ error: "label is required." }, { status: 400 });
  }
  const slug = slugifyLabel(label);
  if (!slug) {
    return json({ error: "label is invalid." }, { status: 400 });
  }

  const existing = await prisma.productAttributeOption.findFirst({
    where: { definitionId, slug },
    include: { mergedInto: true },
  });

  if (existing) {
    if (existing.mergedIntoId && existing.mergedInto) {
      return json({ option: existing.mergedInto });
    }
    if (existing.isArchived) {
      const revived = await prisma.productAttributeOption.update({
        where: { id: existing.id },
        data: { isArchived: false, mergedIntoId: null },
      });
      await invalidateProductAttributeCache();
      return json({ option: revived });
    }
    return json({ option: existing });
  }

  const option = await prisma.productAttributeOption.create({
    data: { definitionId, label, slug },
  });
  await invalidateProductAttributeCache();
  return json({ option });
}
