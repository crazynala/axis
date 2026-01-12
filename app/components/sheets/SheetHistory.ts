import { debugEnabled } from "~/utils/debugFlags";

export type SheetRowId = string | number;

export type SheetUiState = {
  activeCell?: any | null;
  selection?: any | null;
};

export type SheetOp<T> =
  | {
      type: "update";
      id?: SheetRowId;
      index: number;
      before: T;
      after: T;
    }
  | {
      type: "insert";
      index?: number;
      rows: T[];
    }
  | {
      type: "delete";
      index?: number;
      rows: T[];
    }
  | {
      type: "reorder";
      beforeOrder: SheetRowId[];
      afterOrder: SheetRowId[];
    };

export type SheetTransaction<T> = {
  label?: string;
  ops: SheetOp<T>[];
  uiBefore?: SheetUiState | null;
  uiAfter?: SheetUiState | null;
};

export function createSheetHistory<T>() {
  let undoStack: SheetTransaction<T>[] = [];
  let redoStack: SheetTransaction<T>[] = [];
  let pending: SheetTransaction<T> | null = null;

  const begin = (label?: string, uiBefore?: SheetUiState | null) => {
    if (pending) return;
    pending = { label, ops: [], uiBefore: uiBefore ?? null, uiAfter: null };
  };

  const push = (op: SheetOp<T>) => {
    if (!pending) pending = { ops: [] };
    pending.ops.push(op);
  };

  const commit = (uiAfter?: SheetUiState | null) => {
    if (pending && uiAfter !== undefined) pending.uiAfter = uiAfter;
    if (pending && pending.ops.length) {
      undoStack.push(pending);
      redoStack = [];
    }
    pending = null;
  };

  const clear = () => {
    undoStack = [];
    redoStack = [];
    pending = null;
  };

  const canUndo = () => undoStack.length > 0;
  const canRedo = () => redoStack.length > 0;

  const popUndo = () => undoStack.pop() || null;
  const pushUndo = (tx: SheetTransaction<T>) => undoStack.push(tx);
  const popRedo = () => redoStack.pop() || null;
  const pushRedo = (tx: SheetTransaction<T>) => redoStack.push(tx);
  const getUndoLength = () => undoStack.length;
  const getRedoLength = () => redoStack.length;

  return {
    begin,
    push,
    commit,
    clear,
    canUndo,
    canRedo,
    popUndo: () => {
      const tx = popUndo();
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[history] popUndo", {
          undoStack: undoStack.length,
          redoStack: redoStack.length,
        });
      }
      return tx;
    },
    pushUndo,
    popRedo: () => {
      const tx = popRedo();
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[history] popRedo", {
          undoStack: undoStack.length,
          redoStack: redoStack.length,
        });
      }
      return tx;
    },
    pushRedo,
    getUndoLength,
    getRedoLength,
  };
}
