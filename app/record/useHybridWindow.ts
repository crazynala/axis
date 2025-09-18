import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useRecords } from "./RecordContext";

interface HybridWindowOptions {
  module: string;
  /** Number of rows to hydrate initially */
  initialWindow?: number;
  /** How many additional rows to expand by when user scrolls near bottom of current window */
  batchIncrement?: number;
  /** Max IDs per network request */
  chunkSize?: number;
  /** REST endpoint path (defaults to /:module/rows) */
  rowEndpointPath?: string;
  /** Create placeholder skeleton row */
  placeholderFactory?: (id: string | number) => any;
  /** Max concurrent inflight fetch groups */
  maxConcurrent?: number;
  /** Debounce ms before firing a batch fetch after detecting missing */
  debounceMs?: number;
  /** Hard cap on how many missing IDs to request in a single cycle */
  maxRequestIdsPerCycle?: number;
  /** Visual-only: limits how many placeholder rows may be rendered; ignored by hook (handled by consumer) */
  maxPlaceholders?: number;
}

export function useHybridWindow({
  module,
  initialWindow = 100,
  batchIncrement = 200,
  chunkSize = 100,
  rowEndpointPath,
  placeholderFactory,
  maxConcurrent = 4,
  debounceMs = 120,
  maxRequestIdsPerCycle = 800,
}: HybridWindowOptions) {
  const { state, addRows, currentId } = useRecords();
  const inflightIdsRef = useRef<Set<string | number>>(new Set());
  const orphanCountsRef = useRef<Map<string | number, number>>(new Map());
  const [fetching, setFetching] = useState(false);
  const [windowSize, setWindowSize] = useState(initialWindow);
  const windowSizeRef = useRef(windowSize);
  windowSizeRef.current = windowSize;

  // When currentId jumps outside window (keyboard nav to far row), expand window to include it
  useEffect(() => {
    if (!currentId) return;
    if (!state || state.module !== module || !state.idList) return;
    const idx = state.idList.indexOf(currentId);
    if (idx >= 0 && idx + 50 > windowSizeRef.current) {
      setWindowSize(Math.min(state.idList.length, idx + batchIncrement));
    }
  }, [currentId, state, module, batchIncrement]);

  const idList = state?.module === module ? state.idList || [] : [];
  const rowsMap =
    state?.module === module ? state.rowsMap || new Map() : new Map();
  const total = idList.length;

  // With virtualization, we can show all records efficiently
  const records = useMemo(() => {
    return idList.map((id) => {
      const row = rowsMap.get(id);
      if (row) return row;
      return placeholderFactory?.(id) || { id, __loading: true };
    });
  }, [idList, rowsMap, placeholderFactory]);

  // Find missing IDs that need to be fetched
  // Compute the active window we care about hydrating (front slice of id list)
  const activeIds = useMemo(
    () => idList.slice(0, windowSize),
    [idList, windowSize]
  );

  const missingIds = useMemo(() => {
    // Limit scope to activeIds only; don't chase whole universe at once
    return activeIds.filter(
      (id) =>
        !rowsMap.has(id) &&
        !inflightIdsRef.current.has(id) &&
        (orphanCountsRef.current.get(id) || 0) < 2
    );
  }, [activeIds, rowsMap]);

  // Expand window when user scrolls near bottom (detected by majority of active hydrated or placeholders present)
  useEffect(() => {
    if (!idList.length) return;
    // Heuristic: when at least 80% of current window has some row (placeholder or hydrated) AND we have more ids, expand.
    const hydratedOrPlaceholder = activeIds.length;
    if (
      hydratedOrPlaceholder >= windowSizeRef.current * 0.8 &&
      windowSizeRef.current < idList.length
    ) {
      setWindowSize((prev) => Math.min(idList.length, prev + batchIncrement));
    }
  }, [activeIds.length, idList.length, batchIncrement, activeIds]);

  // Auto-fetch missing records
  useEffect(() => {
    if (!missingIds.length) {
      setFetching(false);
      return;
    }
    // Debounce logic
    const handle = setTimeout(() => {
      const idsSlice = missingIds.slice(0, maxRequestIdsPerCycle);
      console.debug("[useHybridWindow] missing (window)", {
        windowSize: windowSizeRef.current,
        totalIds: idList.length,
        missingWithinWindow: missingIds.length,
        requesting: idsSlice.length,
      });
      const chunks: Array<Array<string | number>> = [];
      let current: Array<string | number> = [];
      for (const id of idsSlice) {
        inflightIdsRef.current.add(id);
        current.push(id);
        if (current.length >= chunkSize) {
          chunks.push(current);
          current = [];
        }
      }
      if (current.length) chunks.push(current);
      if (!chunks.length) return;
      setFetching(true);

      let cancelled = false;
      let activeFetches = 0;
      const runChunk = async (chunk: Array<string | number>) => {
        const endpoint = rowEndpointPath || `/${module}/rows`;
        const query = new URLSearchParams();
        chunk.forEach((id) => query.append("ids", String(id)));
        try {
          console.debug(
            "[useHybridWindow] fetch",
            chunk[0],
            "..",
            chunk[chunk.length - 1],
            `(${chunk.length})`
          );
          const resp = await fetch(`${endpoint}?${query}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json, */*" },
          });
          if (!resp.ok) {
            throw new Error(`Bad response (${resp.status})`);
          }
          const ct = resp.headers.get("content-type") || "";
          if (!ct.includes("application/json")) {
            const text = await resp.text();
            throw new SyntaxError(
              `Non-JSON response (${resp.status}): ${text.slice(0, 120)}`
            );
          }
          const data = await resp.json();
          const rows = Array.isArray(data?.rows) ? data.rows : data;
          console.debug("[useHybridWindow] rows received", rows.length);
          if (!cancelled) addRows(module, rows);
        } catch (err) {
          console.error(`Failed to fetch ${module} rows:`, err);
          for (const id of chunk) {
            const oldCount = orphanCountsRef.current.get(id) || 0;
            orphanCountsRef.current.set(id, oldCount + 1);
          }
        } finally {
          for (const id of chunk) inflightIdsRef.current.delete(id);
          activeFetches--;
        }
      };
      const queue = [...chunks];
      const tick = () => {
        if (cancelled) return;
        while (activeFetches < maxConcurrent && queue.length) {
          const c = queue.shift()!;
          activeFetches++;
          runChunk(c).then(() => {
            if (
              !cancelled &&
              (activeFetches === 0 || activeFetches < maxConcurrent) &&
              queue.length === 0
            ) {
              if (activeFetches === 0) setFetching(false);
            }
            if (!cancelled && queue.length) tick();
          });
        }
        if (!queue.length && activeFetches === 0) setFetching(false);
      };
      tick();
      return () => {
        cancelled = true;
      };
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [
    missingIds,
    debounceMs,
    chunkSize,
    rowEndpointPath,
    module,
    addRows,
    maxConcurrent,
    maxRequestIdsPerCycle,
    idList.length,
  ]);

  const atEnd = windowSize >= idList.length;
  const loading = fetching;

  const requestMore = useCallback(() => {
    // No-op: virtualization handles all records efficiently
  }, []);

  return {
    records,
    total,
    atEnd,
    loading,
    fetching,
    requestMore,
    visibleCount: windowSize,
    windowSize,
  };
}
