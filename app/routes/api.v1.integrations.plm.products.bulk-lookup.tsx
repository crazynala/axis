import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "../utils/prisma.server";
import { assertIntegrationsAuth } from "../utils/integrationsAuth.server";

export async function action({ request }: ActionFunctionArgs) {
  assertIntegrationsAuth(request);
  const body = await request.json().catch(() => null);
  const lookups = Array.isArray(body?.lookups) ? body.lookups : [];
  // We don't have a vendor item number field; match by supplier name + SKU exact where possible, else fuzzy vendor name only
  const results = await Promise.all(
    lookups.map(async (lk: any) => {
      const vName = String(lk?.vendorName || "");
      const item = String(lk?.itemNumber || "");
      let match: any = null;
      if (vName && item) {
        const p = await prismaBase.product.findFirst({
          where: {
            supplier: { name: { equals: vName, mode: "insensitive" } },
            OR: [
              { sku: { equals: item, mode: "insensitive" } },
              { name: { contains: item, mode: "insensitive" } },
            ],
          },
          orderBy: { id: "desc" },
          select: { id: true, name: true, sku: true, type: true },
        });
        if (p)
          match = {
            id: p.id,
            code: null,
            name: p.name || "",
            type: (p.type as any) || null,
            score: 96.2,
          };
      }
      if (!match && vName) {
        const p = await prismaBase.product.findFirst({
          where: {
            supplier: { name: { contains: vName, mode: "insensitive" } },
          },
          orderBy: { id: "desc" },
          select: { id: true, name: true, type: true },
        });
        if (p)
          match = {
            id: p.id,
            code: null,
            name: p.name || "",
            type: (p.type as any) || null,
            score: 60,
          };
      }
      return { vendorName: vName || null, itemNumber: item || null, match };
    })
  );
  return json({ results });
}

export default function Route() {
  return null;
}
