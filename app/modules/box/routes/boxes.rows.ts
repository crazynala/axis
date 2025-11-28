import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { fetchBoxesByIds } from "../services/boxHydrator.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
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
    .map((val) => Number(val))
    .filter((val) => Number.isFinite(val)) as number[];
  if (!ids.length) return json({ rows: [] });
  const rows = await fetchBoxesByIds(ids);
  return json({ rows });
}

export const meta = () => [];
