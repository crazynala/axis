import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRecords } from "./RecordContext";

interface HybridWindowOptions {
  module: string;
  initialWindow?: number;
  batchIncrement?: number;
  chunkSize?: number; // fetch chunk size
  rowEndpointPath?: string; // override default /{module}/rows
  placeholderFactory?: (id: string | number) => any;
}

// Generic hook to power hybrid identity roster + sparse hydration windowed list.
// Reuses row hydration endpoint /:module/rows?ids=... and RecordContext rowsMap/idList.
export function useHybridWindow({
  module,
  initialWindow = 100,
  batchIncrement = 100,
  chunkSize = 100,
  rowEndpointPath,
  placeholderFactory,
}: HybridWindowOptions) {
  const { state, addRows, currentId } = useRecords();
  const [visibleCount, setVisibleCount] = useState(initialWindow);
  const inflightIdsRef = useRef<Set<string | number>>(new Set());
  const orphanCountsRef = useRef<Map<string | number, number>>(new Map());
  const [fetching, setFetching] = useState(false);
  const idList = state?.module === module ? state.idList || [] : [];
  const rowsMap =
    state?.module === module ? state.rowsMap || new Map() : new Map();
  const total = idList.length;
  // Compute windowIds from the front by default, but if the selected currentId is near the end
  // or user expanded to include near-total items, bias the window to include the tail to avoid
  // rendering a large number of placeholders when jumping to the last record.
  const windowIds = useMemo(() => {
    if (!idList.length) return [] as Array<string | number>;
    const total = idList.length;
    const count = Math.min(visibleCount, total);
    let start = 0;
    if (currentId != null) {
      const idx = idList.indexOf(currentId as any);
      if (idx >= 0) {
        // If selected index is within the last 'count' items, shift start so selected is visible near the end window
        if (idx >= total - Math.floor(count * 0.6)) {
          start = Math.max(0, total - count);
        }
      }
    }
    return idList.slice(start, start + count);
  }, [idList, visibleCount, currentId]);

  const missingIds = useMemo(
    () => windowIds.filter((id) => !rowsMap.has(id)),
    [windowIds, rowsMap]
  );

  useEffect(() => {
    if (!missingIds.length) {
      setFetching(false);
      return;
    }
    const chunks: Array<Array<string | number>> = [];
    let current: Array<string | number> = [];
    for (const id of missingIds) {
      // Skip ids we've declared orphaned (failed multiple times)
      const failCount = orphanCountsRef.current.get(id) || 0;
      if (failCount >= 2) continue;
      if (inflightIdsRef.current.has(id)) continue;
      inflightIdsRef.current.add(id);
      current.push(id);
      if (current.length >= chunkSize) {
        chunks.push(current);
        current = [];
      }
    }
    if (current.length) chunks.push(current);
    if (!chunks.length) return;
    let cancelled = false;
    setFetching(true);
    (async () => {
      for (const chunk of chunks) {
        try {
          const numeric = chunk.filter((x) => typeof x === "number");
          if (!numeric.length) continue;
          const resp = await fetch(
            `${rowEndpointPath || `/${module}/rows`}?ids=${numeric.join(",")}`
          );
          if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`);
          const data = await resp.json();
          if (!cancelled && data.rows?.length) {
            addRows(module, data.rows, { updateRecordsArray: true });
            // Determine which ids did not come back (orphans)
            const returnedIds = new Set(
              data.rows.map((r: any) =>
                typeof r.id === "number" ? r.id : r.id
              )
            );
            for (const reqId of chunk) {
              if (!returnedIds.has(reqId)) {
                const prev = orphanCountsRef.current.get(reqId) || 0;
                orphanCountsRef.current.set(reqId, prev + 1);
              }
            }
          }
        } catch (_err) {
          // Silent for now; could plug into toast/logging
        } finally {
          chunk.forEach((id) => inflightIdsRef.current.delete(id));
        }
      }
      if (!cancelled) setFetching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [missingIds, module, rowEndpointPath, chunkSize, addRows]);

  const records = useMemo(
    () =>
      windowIds.map((id) => {
        const row = rowsMap.get(id);
        if (row) return row;
        return (
          placeholderFactory?.(id) || {
            id,
            __loading: true,
          }
        );
      }),
    [windowIds, rowsMap, placeholderFactory]
  );

  const atEnd = visibleCount >= total;
  // loading = there exist unresolved ids that are not orphaned
  const loading = useMemo(
    () => missingIds.some((id) => (orphanCountsRef.current.get(id) || 0) < 2),
    [missingIds]
  );
  const requestMore = useCallback(() => {
    if (atEnd) return;
    setVisibleCount((c) => Math.min(c + batchIncrement, total));
  }, [atEnd, batchIncrement, total]);

  // Ensure the currently selected record (from RecordContext) is included in the visible window on index pages
  useEffect(() => {
    if (!state || state.module !== module) return;
    if (currentId == null) return;
    const idx = idList.indexOf(currentId as any);
    if (idx === -1) return;
    if (idx < visibleCount) return; // already in window
    // Expand window to at least include the selected row, plus a small buffer for nicer viewport centering
    const BUFFER = Math.max(10, Math.floor(batchIncrement / 2));
    const target = Math.min(total, idx + 1 + BUFFER);
    setVisibleCount((c) => Math.max(c, target));
  }, [currentId, idList, visibleCount, total, batchIncrement, state, module]);

  return {
    records,
    total,
    atEnd,
    loading,
    fetching,
    requestMore,
    visibleCount,
    setVisibleCount,
    missingIds,
    orphans: Array.from(orphanCountsRef.current.entries())
      .filter(([, c]) => c >= 2)
      .map(([id]) => id),
  };
}
