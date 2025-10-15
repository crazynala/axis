export type ProductLookupInfo = {
  sku: string;
  name?: string | null;
  type?: string | null;
  supplierName?: string | null;
};

export async function lookupProductsBySkus(
  skus: string[]
): Promise<Map<string, ProductLookupInfo>> {
  const unique = Array.from(
    new Set((skus || []).map((s) => String(s || "").trim()).filter(Boolean))
  );
  const map = new Map<string, ProductLookupInfo>();
  if (!unique.length) return map;
  const url = new URL(`/api/products/lookup`, window.location.origin);
  url.searchParams.set("skus", unique.join(","));
  const resp = await fetch(url.toString());
  const data = await resp.json().catch(() => ({}));
  const arr: any[] = Array.isArray(data?.products) ? data.products : [];
  for (const p of arr) {
    const sku = String(p?.sku || "");
    if (!sku) continue;
    map.set(sku, {
      sku,
      name: p?.name ?? null,
      type: p?.type ?? null,
      supplierName: p?.supplier?.name ?? null,
    });
  }
  return map;
}
