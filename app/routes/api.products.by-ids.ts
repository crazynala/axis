import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getUserId } from "../utils/auth.server";
import { fetchAndHydrateProductsByIds } from "~/modules/product/services/hydrateProducts";

export async function loader({ request }: LoaderFunctionArgs) {
  const uid = await getUserId(request);
  if (!uid) return json({ items: [] }, { status: 200 });

  const url = new URL(request.url);
  const idsParam = url.searchParams.getAll("ids");
  let ids: number[] = [];
  for (const p of idsParam) {
    for (const token of p.split(",")) {
      const n = Number(token);
      if (Number.isFinite(n)) ids.push(n);
    }
  }
  // de-dupe
  ids = Array.from(new Set(ids)).slice(0, 500);
  const items = await fetchAndHydrateProductsByIds(ids);
  return json({ items });
}
