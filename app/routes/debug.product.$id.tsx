import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  prismaBase,
  getProductStockSnapshots,
  deprecated_attachStockQty as old_attachStockQty,
  deprecated_attachProductAggregates as old_attachProductAggregates,
} from "../utils/prisma.server";

/**
 * Debug route: /debug/product/:id
 * Returns timing + output shape comparison between legacy enrichment and new materialized view snapshot.
 * Not intended for production end-user exposure; restrict via proxy or remove later.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return json({ error: "Invalid product id" }, { status: 400 });
  }
  const timings: Record<string, number> = {};
  const t0 = Date.now();
  const product = await prismaBase.product.findUnique({ where: { id } });
  if (!product) return json({ error: "Not found" }, { status: 404 });

  // Old path timing
  const tOldStart = Date.now();
  let oldResult: any = null;
  try {
    oldResult = await old_attachProductAggregates(
      await old_attachStockQty({ ...product })
    );
  } catch (err: any) {
    oldResult = { error: String(err?.message || err) };
  }
  const tOldEnd = Date.now();
  timings.old_ms = tOldEnd - tOldStart;

  // New path timing
  const tNewStart = Date.now();
  let snap: any = null;
  try {
    snap = await getProductStockSnapshots(id);
  } catch (err: any) {
    snap = { error: String(err?.message || err) };
  }
  const tNewEnd = Date.now();
  timings.new_ms = tNewEnd - tNewStart;

  timings.total_ms = Date.now() - t0;

  // Normalize comparison numbers
  const oldTotal = Number(oldResult?.c_stockQty ?? 0);
  const newTotal = Number(snap?.totalQty ?? 0);
  const delta = Math.round((newTotal - oldTotal) * 100) / 100;
  const pct =
    oldTotal !== 0 ? Math.round((delta / oldTotal) * 10000) / 100 : null;

  return json({
    id,
    timings,
    compare: {
      oldTotal,
      newTotal,
      delta,
      pctDifference: pct,
      locationCounts: {
        old: Array.isArray(oldResult?.c_byLocation)
          ? oldResult.c_byLocation.length
          : null,
        new: Array.isArray(snap?.byLocation) ? snap.byLocation.length : null,
      },
      batchCounts: {
        old: Array.isArray(oldResult?.c_byBatch)
          ? oldResult.c_byBatch.length
          : null,
        new: Array.isArray(snap?.byBatch) ? snap.byBatch.length : null,
      },
    },
    oldSample: {
      c_stockQty: oldResult?.c_stockQty,
      c_byLocation: oldResult?.c_byLocation?.slice(0, 5),
      c_byBatch: oldResult?.c_byBatch?.slice(0, 5),
    },
    newSample: {
      totalQty: snap?.totalQty,
      byLocation: snap?.byLocation?.slice(0, 5),
      byBatch: snap?.byBatch?.slice(0, 5),
    },
  });
}

export default function DebugProductPage() {
  return (
    <div style={{ padding: 16 }}>
      <h1>Debug Product Snapshot</h1>
      <p>Use as JSON endpoint only. Append product id: /debug/product/123</p>
    </div>
  );
}
