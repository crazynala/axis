import { useCallback, useMemo, useRef, useState } from "react";

type HistoryChange = {
  rowId: string;
  colId: string;
  prevValue: any;
  nextValue: any;
};

type HistoryBatch = {
  changes: HistoryChange[];
  timestamp: number;
  kind: "edit" | "paste" | "fill" | "unknown";
};

type ApplyResult = { appliedCount: number; skippedCount: number };

type UseReactGridUndoRedoOptions = {
  applyCellChanges: (
    changes: Array<{ rowId: string; colId: string; value: any }>,
    opts?: { source: "edit" | "undo" | "redo" }
  ) => ApplyResult;
  maxHistory?: number;
  coalesceWindowMs?: number;
  onSkipped?: (info: { kind: "undo" | "redo"; skippedCount: number }) => void;
};

export function useReactGridUndoRedo({
  applyCellChanges,
  maxHistory = 50,
  coalesceWindowMs = 400,
  onSkipped,
}: UseReactGridUndoRedoOptions) {
  const undoStackRef = useRef<HistoryBatch[]>([]);
  const redoStackRef = useRef<HistoryBatch[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const bump = useCallback(() => {
    setHistoryVersion((v) => v + 1);
  }, []);

  const recordAppliedBatch = useCallback(
    (
      applied: HistoryChange[],
      meta?: { kind?: "edit" | "paste" | "fill" | "unknown" }
    ) => {
      if (!applied?.length) return;
      const now = Date.now();
      const kind = meta?.kind ?? "unknown";
      const last = undoStackRef.current[undoStackRef.current.length - 1];
      if (
        kind === "edit" &&
        applied.length === 1 &&
        last &&
        last.kind === "edit" &&
        last.changes.length === 1 &&
        now - last.timestamp <= coalesceWindowMs &&
        last.changes[0].rowId === applied[0].rowId &&
        last.changes[0].colId === applied[0].colId
      ) {
        last.changes[0].nextValue = applied[0].nextValue;
        last.timestamp = now;
        redoStackRef.current = [];
        bump();
        return;
      }
      undoStackRef.current.push({
        changes: applied,
        timestamp: now,
        kind,
      });
      if (undoStackRef.current.length > maxHistory) {
        undoStackRef.current.splice(
          0,
          undoStackRef.current.length - maxHistory
        );
      }
      redoStackRef.current = [];
      bump();
    },
    [bump, coalesceWindowMs, maxHistory]
  );

  const undo = useCallback(
    (_source: "button" | "hotkey" = "button") => {
      const batch = undoStackRef.current.pop();
      if (!batch) return;
      const { skippedCount } = applyCellChanges(
        batch.changes.map((change) => ({
          rowId: change.rowId,
          colId: change.colId,
          value: change.prevValue,
        })),
        { source: "undo" }
      );
      redoStackRef.current.push(batch);
      if (skippedCount > 0) {
        onSkipped?.({ kind: "undo", skippedCount });
      }
      bump();
    },
    [applyCellChanges, bump, onSkipped]
  );

  const redo = useCallback(
    (_source: "button" | "hotkey" = "button") => {
      const batch = redoStackRef.current.pop();
      if (!batch) return;
      const { skippedCount } = applyCellChanges(
        batch.changes.map((change) => ({
          rowId: change.rowId,
          colId: change.colId,
          value: change.nextValue,
        })),
        { source: "redo" }
      );
      undoStackRef.current.push(batch);
      if (skippedCount > 0) {
        onSkipped?.({ kind: "redo", skippedCount });
      }
      bump();
    },
    [applyCellChanges, bump, onSkipped]
  );

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    bump();
  }, [bump]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  return useMemo(
    () => ({
      recordAppliedBatch,
      canUndo,
      canRedo,
      undo,
      redo,
      clearHistory,
      historyVersion,
    }),
    [
      canRedo,
      canUndo,
      clearHistory,
      recordAppliedBatch,
      redo,
      undo,
      historyVersion,
    ]
  );
}
