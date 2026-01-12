import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataGridOperation } from "./useDataGrid";
import {
  createSheetHistory,
  type SheetOp,
  type SheetRowId,
  type SheetUiState,
} from "./SheetHistory";
import type { SheetController } from "./SheetController";
import { debugEnabled } from "~/utils/debugFlags";

type UndoableOptions<T> = {
  getRowId?: (row: T) => SheetRowId | null | undefined;
  enabled?: boolean;
  preserveHistoryOnExternalChange?: boolean;
  isRowBlank?: (row: T) => boolean;
};

type DiffResult<T> = {
  ops: SheetOp<T>[];
  usesIds: boolean;
  orderChanged?: boolean;
};

const isObject = (value: any) =>
  value !== null && typeof value === "object";

const isEqual = (a: any, b: any, seen = new WeakMap<any, any>()) => {
  if (Object.is(a, b)) return true;
  if (!isObject(a) || !isObject(b)) return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isEqual(a[key], b[key], seen)) return false;
  }
  return true;
};

const cloneRow = <T,>(row: T): T => {
  if (row && typeof row === "object") return { ...(row as any) };
  return row;
};

const cloneRows = <T,>(rows: T[]) => rows.map(cloneRow);

const cloneRowsDeep = <T,>(rows: T[]) => {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(rows) as T[];
    }
  } catch {
    // fall through to JSON or shallow clone
  }
  try {
    return JSON.parse(JSON.stringify(rows)) as T[];
  } catch {
    return cloneRows(rows);
  }
};

const defaultGetRowId = (row: any): SheetRowId | undefined => {
  if (!row) return undefined;
  return row.id ?? row.localKey ?? row.key ?? undefined;
};

const defaultIsRowBlank = (row: any): boolean => {
  if (!row || typeof row !== "object") return true;
  const ignoreKeys = new Set([
    "disableControls",
    "groupStart",
    "isGroupPad",
    "localKey",
    "id",
  ]);
  for (const key of Object.keys(row)) {
    if (ignoreKeys.has(key)) continue;
    const value = (row as any)[key];
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) return false;
    if (typeof value === "string" && value.trim() !== "") return false;
    if (typeof value === "boolean" && value) return false;
    if (typeof value === "object") return false;
  }
  return true;
};

const buildOrder = <T,>(rows: T[], getRowId: (row: T) => SheetRowId) =>
  rows.map((row) => getRowId(row));

const applyReorder = <T,>(
  rows: T[],
  order: SheetRowId[],
  getRowId: (row: T) => SheetRowId
) => {
  const map = new Map<SheetRowId, T>();
  rows.forEach((row) => map.set(getRowId(row), row));
  const ordered: T[] = [];
  order.forEach((id) => {
    const row = map.get(id);
    if (row) ordered.push(row);
  });
  return ordered;
};

const applyOps = <T,>(
  rows: T[],
  ops: SheetOp<T>[],
  direction: "undo" | "redo",
  getRowId: (row: T) => SheetRowId,
  usesIds: boolean
) => {
  let next = rows.slice();
  const orderedOps = direction === "undo" ? [...ops].reverse() : ops;
  for (const op of orderedOps) {
    if (op.type === "update") {
      const id = usesIds ? op.id : undefined;
      let idx = op.index;
      if (usesIds && id != null) {
        idx = next.findIndex((row) => getRowId(row) === id);
      }
      if (idx < 0 || idx >= next.length) continue;
      const value = direction === "undo" ? op.before : op.after;
      next[idx] = cloneRow(value);
    } else if (op.type === "insert") {
      if (direction === "undo") {
        if (usesIds) {
          const ids = new Set(op.rows.map((r) => getRowId(r)));
          next = next.filter((row) => !ids.has(getRowId(row)));
        } else if (typeof op.index === "number") {
          next.splice(op.index, op.rows.length);
        }
      } else {
        if (usesIds) {
          next = next.concat(op.rows.map(cloneRow));
        } else if (typeof op.index === "number") {
          next.splice(op.index, 0, ...op.rows.map(cloneRow));
        }
      }
    } else if (op.type === "delete") {
      if (direction === "undo") {
        if (usesIds) {
          next = next.concat(op.rows.map(cloneRow));
        } else if (typeof op.index === "number") {
          next.splice(op.index, 0, ...op.rows.map(cloneRow));
        }
      } else {
        if (usesIds) {
          const ids = new Set(op.rows.map((r) => getRowId(r)));
          next = next.filter((row) => !ids.has(getRowId(row)));
        } else if (typeof op.index === "number") {
          next.splice(op.index, op.rows.length);
        }
      }
    } else if (op.type === "reorder") {
      if (!usesIds) continue;
      const order = direction === "undo" ? op.beforeOrder : op.afterOrder;
      next = applyReorder(next, order, getRowId);
    }
  }
  return next;
};

const diffByIds = <T,>(
  prev: T[],
  next: T[],
  getRowId: (row: T) => SheetRowId
): DiffResult<T> => {
  const prevOrder = buildOrder(prev, getRowId);
  const nextOrder = buildOrder(next, getRowId);
  const prevMap = new Map<SheetRowId, T>();
  const nextMap = new Map<SheetRowId, T>();
  prev.forEach((row) => prevMap.set(getRowId(row), row));
  next.forEach((row) => nextMap.set(getRowId(row), row));

  const ops: SheetOp<T>[] = [];
  const updates: SheetOp<T>[] = [];
  const inserts: T[] = [];
  const deletes: T[] = [];

  prevOrder.forEach((id) => {
    if (!nextMap.has(id)) {
      const row = prevMap.get(id);
      if (row) deletes.push(cloneRow(row));
    }
  });
  nextOrder.forEach((id) => {
    if (!prevMap.has(id)) {
      const row = nextMap.get(id);
      if (row) inserts.push(cloneRow(row));
    }
  });
  nextOrder.forEach((id, index) => {
    const before = prevMap.get(id);
    const after = nextMap.get(id);
    if (before && after && !isEqual(before, after)) {
      updates.push({
        type: "update",
        id,
        index,
        before: cloneRow(before),
        after: cloneRow(after),
      });
    }
  });

  ops.push(...updates);
  if (deletes.length) ops.push({ type: "delete", rows: deletes });
  if (inserts.length) ops.push({ type: "insert", rows: inserts });

  const orderChanged =
    prevOrder.length !== nextOrder.length ||
    prevOrder.some((id, idx) => id !== nextOrder[idx]);
  if (orderChanged || inserts.length || deletes.length) {
    ops.push({
      type: "reorder",
      beforeOrder: prevOrder,
      afterOrder: nextOrder,
    });
  }

  return { ops, usesIds: true, orderChanged };
};

const diffByOperations = <T,>(
  prev: T[],
  next: T[],
  operations?: DataGridOperation<T>[]
): SheetOp<T>[] => {
  if (!operations || !operations.length) return [];
  const ops: SheetOp<T>[] = [];
  for (const op of operations) {
    if (op.type === "UPDATE") {
      for (let i = op.fromRowIndex; i < op.toRowIndex; i++) {
        if (i < 0 || i >= next.length) continue;
        ops.push({
          type: "update",
          index: i,
          before: cloneRow(prev[i]),
          after: cloneRow(next[i]),
        });
      }
    } else if (op.type === "CREATE") {
      ops.push({
        type: "insert",
        index: op.fromRowIndex,
        rows: next.slice(op.fromRowIndex, op.toRowIndex).map(cloneRow),
      });
    } else if (op.type === "DELETE") {
      ops.push({
        type: "delete",
        index: op.fromRowIndex,
        rows: prev.slice(op.fromRowIndex, op.toRowIndex).map(cloneRow),
      });
    }
  }
  return ops;
};

const diffByIndex = <T,>(
  prev: T[],
  next: T[],
  isRowBlank: (row: T) => boolean
): SheetOp<T>[] => {
  const ops: SheetOp<T>[] = [];
  const len = Math.min(prev.length, next.length);
  for (let i = 0; i < len; i++) {
    const beforeBlank = isRowBlank(prev[i]);
    const afterBlank = isRowBlank(next[i]);
    if (beforeBlank && !afterBlank) {
      ops.push({ type: "insert", index: i, rows: [cloneRow(next[i])] });
      continue;
    }
    if (!beforeBlank && afterBlank) {
      ops.push({ type: "delete", index: i, rows: [cloneRow(prev[i])] });
      continue;
    }
    if (!isEqual(prev[i], next[i])) {
      ops.push({
        type: "update",
        index: i,
        before: cloneRow(prev[i]),
        after: cloneRow(next[i]),
      });
    }
  }
  if (next.length > prev.length) {
    ops.push({
      type: "insert",
      index: prev.length,
      rows: next.slice(prev.length).map(cloneRow),
    });
  } else if (prev.length > next.length) {
    ops.push({
      type: "delete",
      index: next.length,
      rows: prev.slice(next.length).map(cloneRow),
    });
  }
  return ops;
};

const computeDiff = <T,>(
  prev: T[],
  next: T[],
  getRowId?: (row: T) => SheetRowId | null | undefined,
  operations?: DataGridOperation<T>[],
  isRowBlank?: (row: T) => boolean
): DiffResult<T> => {
  const idOf = getRowId || (defaultGetRowId as any);
  const isBlank = isRowBlank || (defaultIsRowBlank as any);
  const prevIds = prev.map(idOf);
  const nextIds = next.map(idOf);
  const stableIds =
    prevIds.every((id) => id != null) && nextIds.every((id) => id != null);

  if (stableIds) {
    return diffByIds(prev, next, idOf as any);
  }

  const orderChangedByRef = (() => {
    const refIndex = new Map<any, number>();
    prev.forEach((row, idx) => refIndex.set(row, idx));
    for (let i = 0; i < next.length; i++) {
      const prevIdx = refIndex.get(next[i]);
      if (prevIdx != null && prevIdx !== i) return true;
    }
    return false;
  })();

  const opDiff = diffByOperations(prev, next, operations);
  if (opDiff.length)
    return { ops: opDiff, usesIds: false, orderChanged: orderChangedByRef };
  return {
    ops: diffByIndex(prev, next, isBlank as any),
    usesIds: false,
    orderChanged: orderChangedByRef,
  };
};

export function useUndoableController<T>(
  base: SheetController<T>,
  options?: UndoableOptions<T>
): SheetController<T> {
  const enabled = options?.enabled !== false;
  const getRowId = options?.getRowId || (defaultGetRowId as any);
  const isRowBlank = options?.isRowBlank || (defaultIsRowBlank as any);
  const preserveHistoryOnExternalChange =
    options?.preserveHistoryOnExternalChange ?? false;

  const historyRef = useRef(createSheetHistory<T>());
  const [historyVersion, setHistoryVersion] = useState(0);
  const applyingRef = useRef(false);
  const transactionOpenRef = useRef(false);
  const transactionSnapshotRef = useRef<T[] | null>(null);
  const lastValueRef = useRef(base.value ?? []);
  const lastSnapshotRef = useRef<T[]>(cloneRowsDeep(base.value ?? []));

  const applyRows = useCallback(
    (next: T[], operations?: DataGridOperation<T>[]) => {
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        const prevSnapshot = lastSnapshotRef.current || [];
        const sameArray = next === lastValueRef.current;
        const maxLen = Math.max(prevSnapshot.length, next.length);
        let changedRowsCount = 0;
        for (let i = 0; i < maxLen; i++) {
          if (prevSnapshot[i] !== next[i]) changedRowsCount += 1;
        }
        // eslint-disable-next-line no-console
        console.info("[UNDO] setRows called", {
          sameArray,
          changedRowsCount,
        });
      }
      applyingRef.current = true;
      if (base.onChange) base.onChange(next, operations);
      else base.setValue?.(next);
      applyingRef.current = false;
      lastValueRef.current = next;
      lastSnapshotRef.current = cloneRowsDeep(next);
    },
    [base]
  );

  useEffect(() => {
    if (applyingRef.current) return;
    const currentValue = base.value ?? [];
    if (currentValue === lastValueRef.current) return;
    lastValueRef.current = currentValue;
    lastSnapshotRef.current = cloneRowsDeep(currentValue);
    if (!preserveHistoryOnExternalChange) {
      historyRef.current.clear();
      setHistoryVersion((v) => v + 1);
    }
  }, [base.value, preserveHistoryOnExternalChange]);

  const beginTransaction = useCallback(
    (label?: string, uiBefore?: SheetUiState | null) => {
      if (transactionOpenRef.current) return;
      transactionSnapshotRef.current = cloneRowsDeep(
        lastSnapshotRef.current ?? []
      );
      historyRef.current.begin(label, uiBefore ?? null);
      transactionOpenRef.current = true;
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[sheet-history] begin", label, {
          rows: transactionSnapshotRef.current.length,
        });
      }
    },
    []
  );

  const commitTransaction = useCallback(
    (uiAfter?: SheetUiState | null) => {
      if (!transactionOpenRef.current) return;
      const beforeSnapshot = transactionSnapshotRef.current ?? [];
      const afterSnapshot = lastSnapshotRef.current ?? [];
      const diff = computeDiff(
        beforeSnapshot,
        afterSnapshot,
        getRowId,
        undefined,
        isRowBlank
      );
      if (!diff.usesIds && diff.orderChanged) {
        clearHistory("orderChanged:transaction");
      } else {
        diff.ops.forEach((op) => historyRef.current.push(op));
      }
      historyRef.current.commit(uiAfter ?? null);
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[history] push", {
          reason: "transaction",
          ops: diff.ops.length,
          undoStack: historyRef.current.getUndoLength?.() ?? 0,
        });
      }
      transactionOpenRef.current = false;
      transactionSnapshotRef.current = null;
      setHistoryVersion((v) => v + 1);
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[sheet-history] commit", {
          ops: diff.ops.length,
          orderChanged: diff.orderChanged,
          rows: afterSnapshot.length,
        });
      }
    },
    [getRowId, isRowBlank]
  );

  const clearHistory = useCallback((reason?: string) => {
    if (debugEnabled("DEBUG_SHEET_HISTORY")) {
      // eslint-disable-next-line no-console
      console.info("[history] clear", {
        reason: reason || "unknown",
        undoStack: historyRef.current.getUndoLength?.() ?? 0,
      });
    }
    historyRef.current.clear();
    setHistoryVersion((v) => v + 1);
  }, []);

  const onChange = useCallback(
    (next: T[], operations?: DataGridOperation<T>[]) => {
      if (!enabled) {
        applyRows(next, operations);
        return;
      }
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        const prevSnapshot = lastSnapshotRef.current || [];
        const sameArray = next === lastValueRef.current;
        const sameRowRefs = Math.min(
          prevSnapshot.length,
          next.length
        )
          ? prevSnapshot.filter((row, i) => row === next[i]).length
          : 0;
        // eslint-disable-next-line no-console
        console.info("[sheet-history] onChange", {
          sameArray,
          sameRowRefs,
          nextRows: next.length,
          hasOperations: Boolean(operations?.length),
        });
      }

      if (!transactionOpenRef.current) {
        const prevSnapshot = lastSnapshotRef.current || [];
        const diff = computeDiff(
          prevSnapshot,
          next,
          getRowId,
          operations,
          isRowBlank
        );
        if (!diff.usesIds && diff.orderChanged) {
          clearHistory("orderChanged");
          applyRows(next, operations);
          return;
        }
        historyRef.current.begin();
        diff.ops.forEach((op) => historyRef.current.push(op));
        historyRef.current.commit();
        if (debugEnabled("DEBUG_SHEET_HISTORY")) {
          // eslint-disable-next-line no-console
          console.info("[history] push", {
            reason: "onChange",
            ops: diff.ops.length,
            undoStack: historyRef.current.getUndoLength?.() ?? 0,
          });
        }
      }
      applyRows(next, operations);
      setHistoryVersion((v) => v + 1);
    },
    [applyRows, enabled, getRowId, isRowBlank, clearHistory]
  );

  const setValue = useCallback(
    (next: T[]) => {
      onChange(next);
    },
    [onChange]
  );

  const undo = useCallback(() => {
    const tx = historyRef.current.popUndo();
    if (!tx) return;
    if (debugEnabled("DEBUG_SHEET_HISTORY")) {
      // eslint-disable-next-line no-console
      console.info("[history] undo", {
        undoStack: historyRef.current.getUndoLength?.() ?? 0,
      });
    }
    const prev = lastSnapshotRef.current || [];
    const usesIds = tx.ops.some((op) => op.type === "reorder");
    const next = applyOps(
      prev,
      tx.ops,
      "undo",
      getRowId as any,
      usesIds
    );
    applyRows(next);
    historyRef.current.pushRedo(tx);
    setHistoryVersion((v) => v + 1);
    return tx.uiBefore ?? null;
  }, [applyRows, getRowId]);

  const redo = useCallback(() => {
    const tx = historyRef.current.popRedo();
    if (!tx) return;
    if (debugEnabled("DEBUG_SHEET_HISTORY")) {
      // eslint-disable-next-line no-console
      console.info("[history] redo", {
        redoStack: historyRef.current.getRedoLength?.() ?? 0,
      });
    }
    const prev = lastSnapshotRef.current || [];
    const usesIds = tx.ops.some((op) => op.type === "reorder");
    const next = applyOps(
      prev,
      tx.ops,
      "redo",
      getRowId as any,
      usesIds
    );
    applyRows(next);
    historyRef.current.pushUndo(tx);
    setHistoryVersion((v) => v + 1);
    return tx.uiAfter ?? null;
  }, [applyRows, getRowId]);

  const reset = useCallback(
    (next?: T[]) => {
      if (base.reset) base.reset(next);
      else if (next) applyRows(next);
      clearHistory("reset");
    },
    [applyRows, base, clearHistory]
  );

  const commit = useCallback(() => {
    base.commit?.();
    clearHistory("commit");
  }, [base, clearHistory]);

  const replaceData = useCallback(
    (next: T[]) => {
      applyRows(next);
      clearHistory("replaceData");
    },
    [applyRows, clearHistory]
  );

  const applyDerivedPatch = useCallback(
    (updater: T[] | ((rows: T[]) => T[])) => {
      const current = lastSnapshotRef.current || [];
      const next =
        typeof updater === "function"
          ? (updater as (rows: T[]) => T[])(cloneRowsDeep(current))
          : updater;
      if (!Array.isArray(next)) return;
      applyRows(next);
    },
    [applyRows]
  );

  return useMemo(
    () => ({
      ...base,
      value: base.value ?? [],
      onChange,
      setValue,
      reset,
      commit,
      undo,
      redo,
      beginTransaction,
      commitTransaction,
      clearHistory,
      applyDerivedPatch,
      replaceData,
      canUndo: historyRef.current.canUndo(),
      canRedo: historyRef.current.canRedo(),
      historyVersion,
    }),
    [
      base,
      onChange,
      setValue,
      reset,
      commit,
      undo,
      redo,
      beginTransaction,
      commitTransaction,
      clearHistory,
      applyDerivedPatch,
      replaceData,
      historyVersion,
    ]
  );
}
