import { useEffect, useRef, useState } from "react";

export function useColumnWidths(storageKey: string) {
  const [widthsByKey, setWidthsByKey] = useState<Record<string, number>>({});
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        setWidthsByKey(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(widthsByKey)
        );
      } catch {
        // ignore storage errors
      }
    }, 200);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [storageKey, widthsByKey]);

  return { widthsByKey, setWidthsByKey };
}

export function pushHistory<T>(
  historyRef: React.MutableRefObject<{ past: T[]; future: T[] }>,
  batch: T,
  limit = 50
) {
  historyRef.current.past.push(batch);
  historyRef.current.future = [];
  if (historyRef.current.past.length > limit) {
    historyRef.current.past.shift();
  }
}

export function normalizeTrailingDrafts<T>(
  drafts: T[],
  isBlank: (row: T) => boolean,
  createDraft: () => T,
  minTotalRows: number,
  totalLines: number
) {
  const next = drafts.slice();
  let trailingBlankCount = 0;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (!isBlank(next[i])) break;
    trailingBlankCount += 1;
  }
  while (
    trailingBlankCount > 1 &&
    totalLines + next.length > minTotalRows
  ) {
    next.pop();
    trailingBlankCount -= 1;
  }
  if (!next.length || !isBlank(next[next.length - 1])) {
    next.push(createDraft());
  }
  while (totalLines + next.length < minTotalRows) {
    next.push(createDraft());
  }
  return next;
}
