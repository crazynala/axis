import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) return json({ rows: [] });
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (!ids.length) return json({ rows: [] });
  const rows = await prisma.job.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      projectCode: true,
      company: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });
  const map = new Map(rows.map((r) => [r.id, r] as const));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);
  return json({ rows: ordered });
}

export default function JobsRowsRoute() {
  return null;
}
