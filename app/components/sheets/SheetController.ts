import type { DataGridOperation } from "~/components/sheets/useDataGrid";

export type SheetController<T> = {
  value: T[];
  onChange?: (next: T[], operations?: DataGridOperation<T>[]) => void;
  setValue?: (next: T[]) => void;
  rowClassName?: (args: { rowData: T; rowIndex: number }) => string | undefined;
  state?: { isDirty?: boolean };
  reset?: (next?: T[]) => void;
  commit?: () => void;
  getValues?: (opts?: { includeDeleted?: boolean }) => T[];
  undo?: () => any;
  redo?: () => any;
  beginTransaction?: (label?: string, uiBefore?: any) => void;
  commitTransaction?: (uiAfter?: any) => void;
  clearHistory?: () => void;
  applyDerivedPatch?: (updater: T[] | ((rows: T[]) => T[])) => void;
  replaceData?: (next: T[]) => void;
  triggerUndo?: () => void;
  triggerRedo?: () => void;
  onUndoRedo?: (kind: "undo" | "redo", source: "hotkey" | "button") => void;
  canUndo?: boolean;
  canRedo?: boolean;
  historyVersion?: number;
};

export function adaptDataGridController<T>(
  controller: {
    value: T[];
    onChange: (next: T[], operations?: DataGridOperation<T>[]) => void;
    rowClassName?: (args: { rowData: T; rowIndex: number }) =>
      | string
      | undefined;
    gridState?: { isDirty?: boolean };
    reset?: () => void;
    commit?: () => void;
    getValues?: (opts?: { includeDeleted?: boolean }) => T[];
  }
): SheetController<T> {
  return {
    value: controller.value,
    onChange: controller.onChange,
    rowClassName: controller.rowClassName,
    state: controller.gridState,
    reset: controller.reset,
    commit: controller.commit,
    getValues: controller.getValues,
  };
}

export function adaptRdgController<T>(
  controller: {
    value: T[];
    setValue: (next: T[]) => void;
    state?: { isDirty?: boolean };
    reset?: (next?: T[]) => void;
  }
): SheetController<T> {
  return {
    value: controller.value,
    setValue: controller.setValue,
    onChange: (next) => controller.setValue(next),
    state: controller.state,
    reset: controller.reset,
  };
}
