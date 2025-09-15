import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "../utils/prisma.server";
import { assertIntegrationsAuth } from "../utils/integrationsAuth.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  assertIntegrationsAuth(request);
  const id = Number(params.id);
  if (!Number.isFinite(id))
    return json({ error: "Invalid id" }, { status: 400 });
  const p = await prismaBase.product.findUnique({
    where: { id },
    select: {
      id: true,
      sku: true,
      name: true,
      description: true,
      type: true,
      supplier: { select: { name: true } },
      category: { select: { label: true, code: true } },
    },
  });
  if (!p) return json({ error: "Not found" }, { status: 404 });
  const item = {
    id: p.id,
    code: null as string | null,
    sku: p.sku || null,
    name: p.name || "",
    type: (p.type as any) || null,
    vendorName: p.supplier?.name || null,
    vendorItemNumber: null as string | null,
    uom: null as string | null,
    imageUrl: null as string | null,
    attributes: p.category?.label ? { category: p.category.label } : undefined,
  };
  return json(item);
}

export default function Route() {
  return null;
}
