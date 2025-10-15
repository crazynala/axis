import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../../../utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const __debug = process.env.NODE_ENV !== "production";
  // Support repeated ids=1&ids=2 and comma lists ids=1,2; trim, dedupe, cap
  const rawIds = url.searchParams.getAll("ids");
  if (!rawIds.length) return json({ rows: [] });
  const flattened: string[] = [];
  for (const part of rawIds) {
    if (!part) continue;
    for (const piece of part.split(",")) {
      const trimmed = piece.trim();
      if (trimmed) flattened.push(trimmed);
    }
  }
  const ids = Array.from(new Set(flattened))
    .slice(0, 500)
    .map((v) => (v.match(/^\d+$/) ? Number(v) : v))
    .filter((v) => typeof v === "number") as number[];
  if (!ids.length) return json({ rows: [] });
  if (__debug) {
    // eslint-disable-next-line no-console
    console.debug("[jobs.rows] requested ids", ids.length);
  }
  const rows = await prisma.job.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      projectCode: true,
      name: true,
      jobType: true,
      startDate: true,
      endDate: true,
      status: true,
      company: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });
  const map = new Map(rows.map((r) => [r.id, r] as const));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);
  if (__debug) {
    // eslint-disable-next-line no-console
    console.debug("[jobs.rows] returned rows", {
      requested: ids.length,
      fetched: rows.length,
      ordered: ordered.length,
    });
  }
  return json({ rows: ordered });
}
