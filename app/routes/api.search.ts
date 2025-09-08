import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";
import { getUserId } from "../utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Require auth like the rest of the app
  const uid = await getUserId(request);
  if (!uid) return json({ jobs: [], products: [] }, { status: 200 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ jobs: [], products: [] });

  const asNum = Number(q);
  const isNum = Number.isFinite(asNum as any);

  const [jobs, products] = await Promise.all([
    prisma.job.findMany({
      where: {
        OR: [isNum ? { id: asNum as number } : { id: { gt: -1 } }, { name: { contains: q, mode: "insensitive" } }, { projectCode: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, name: true, projectCode: true },
      take: 10,
      orderBy: { id: "desc" },
    }),
    prisma.product.findMany({
      where: {
        OR: [isNum ? { id: asNum as number } : { id: { gt: -1 } }, { sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, sku: true, name: true },
      take: 10,
      orderBy: { id: "desc" },
    }),
  ]);

  return json({ jobs, products });
}
