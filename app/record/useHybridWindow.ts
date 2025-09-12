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
  const { state, addRows } = useRecords();
  const [visibleCount, setVisibleCount] = useState(initialWindow);
  const inflightIdsRef = useRef<Set<string | number>>(new Set());
  const idList = state?.module === module ? state.idList || [] : [];
  const rowsMap =
    state?.module === module ? state.rowsMap || new Map() : new Map();
  const total = idList.length;
  const windowIds = useMemo(
    () => idList.slice(0, visibleCount),
    [idList, visibleCount]
  );

  const missingIds = useMemo(
    () => windowIds.filter((id) => !rowsMap.has(id)),
    [windowIds, rowsMap]
  );

  useEffect(() => {
    if (!missingIds.length) return;
    const chunks: Array<Array<string | number>> = [];
    let current: Array<string | number> = [];
    for (const id of missingIds) {
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
          }
        } catch (_err) {
          // Silent for now; could plug into toast/logging
        } finally {
          chunk.forEach((id) => inflightIdsRef.current.delete(id));
        }
      }
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
  const loading = missingIds.length > 0;
  const requestMore = useCallback(() => {
    if (atEnd) return;
    setVisibleCount((c) => Math.min(c + batchIncrement, total));
  }, [atEnd, batchIncrement, total]);

  return {
    records,
    total,
    atEnd,
    loading,
    requestMore,
    visibleCount,
    setVisibleCount,
    missingIds,
  };
}
