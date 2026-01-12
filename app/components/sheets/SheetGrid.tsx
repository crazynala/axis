import {
  forwardRef,
  type ForwardedRef,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  useCallback,
} from "react";
import * as RDG from "react-datasheet-grid";
import type { SheetController } from "./SheetController";
import { useUndoableController } from "./useUndoableController";
import type { SheetRowId, SheetUiState } from "./SheetHistory";

type SheetGridProps<T> = Omit<RDG.DataSheetGridProps<T>, "value" | "onChange"> & {
  controller?: SheetController<T>;
  value?: T[];
  onChange?: RDG.DataSheetGridProps<T>["onChange"];
  undoable?: boolean;
  getRowId?: (row: T) => SheetRowId | null | undefined;
  isRowBlank?: (row: T) => boolean;
  renderUndoRedo?: (args: {
    undo?: () => void;
    redo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
  }) => ReactNode;
};

export const SheetGrid = forwardRef(function SheetGridInner<T>(
  {
    controller,
    value,
    onChange,
    rowClassName,
    undoable = true,
    getRowId,
    isRowBlank,
    renderUndoRedo,
    ...rest
  }: SheetGridProps<T>,
  ref: ForwardedRef<RDG.DataSheetGridRef>
) {
  const baseController = controller
    ? { ...controller, ...(onChange ? { onChange } : {}) }
    : ({ value: value ?? [] } as any);
  const undoableController = useUndoableController(baseController, {
    enabled: undoable && !!controller,
    getRowId,
    isRowBlank,
  });
  const activeController = controller ? undoableController : undefined;
  const resolvedValue = value ?? (activeController ? activeController.value : []);
  const resolvedOnChange = activeController
    ? activeController.onChange ||
      (activeController.setValue
        ? (next: T[]) => activeController.setValue?.(next)
        : undefined)
    : onChange;
  const resolvedRowClassName = rowClassName || activeController?.rowClassName;

  const {
    height,
    style,
    onActiveCellChange,
    onSelectionChange,
    onEditStart,
    onEditEnd,
    ...gridProps
  } = rest as RDG.DataSheetGridProps<T>;
  const DEBUG_SHEET_HISTORY =
    typeof window !== "undefined" &&
    (window as any).__DEBUG_SHEET_HISTORY__ === true;
  const wrapperStyle: CSSProperties = {
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    ...(height != null ? { height } : { height: "100%" }),
  };
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<RDG.DataSheetGridRef | null>(null);
  useImperativeHandle(ref, () => gridRef.current as any);
  const [isFocused, setIsFocused] = useState(false);
  const activeCellRef = useRef<SheetUiState["activeCell"] | null>(null);
  const selectionRef = useRef<SheetUiState["selection"] | null>(null);

  const getUiState = useCallback((): SheetUiState => {
    return {
      activeCell:
        activeCellRef.current ?? gridRef.current?.getActiveCell?.() ?? null,
      selection:
        selectionRef.current ?? gridRef.current?.getSelection?.() ?? null,
    };
  }, []);

  const restoreUiState = useCallback((ui?: SheetUiState | null) => {
    if (!ui || !gridRef.current) return;
    const { activeCell, selection } = ui;
    if (selection) {
      gridRef.current.setSelection(selection as any);
    } else if (activeCell) {
      gridRef.current.setActiveCell(activeCell as any);
    }
  }, []);
  const undoRedoApi = useMemo(
    () => ({
      undo: activeController?.undo,
      redo: activeController?.redo,
      canUndo: activeController?.canUndo,
      canRedo: activeController?.canRedo,
    }),
    [
      activeController?.undo,
      activeController?.redo,
      activeController?.canUndo,
      activeController?.canRedo,
    ]
  );

  useEffect(() => {
    if (!activeController?.undo && !activeController?.redo) return;
      const handler = (e: KeyboardEvent) => {
        if (!isFocused) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        if (activeController?.redo && activeController?.canRedo) {
          e.preventDefault();
          const ui = activeController.redo();
          requestAnimationFrame(() => restoreUiState(ui));
        }
      } else if (key === "z") {
        if (activeController?.undo && activeController?.canUndo) {
          e.preventDefault();
          const ui = activeController.undo();
          requestAnimationFrame(() => restoreUiState(ui));
        }
      } else if (key === "y") {
        if (activeController?.redo && activeController?.canRedo) {
          e.preventDefault();
          const ui = activeController.redo();
          requestAnimationFrame(() => restoreUiState(ui));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activeController?.undo,
    activeController?.redo,
    activeController?.canUndo,
    activeController?.canRedo,
    isFocused,
    restoreUiState,
  ]);

  const handleActiveCellChange = useCallback(
    (args: { cell: any | null }) => {
      activeCellRef.current = args?.cell ?? null;
      onActiveCellChange?.(args as any);
    },
    [onActiveCellChange]
  );

  const handleSelectionChange = useCallback(
    (args: { selection: any | null }) => {
      selectionRef.current = args?.selection ?? null;
      onSelectionChange?.(args as any);
    },
    [onSelectionChange]
  );

  const handleEditStart = useCallback(
    (args: { reason: "typing" | "paste" | "delete" | "fill" }) => {
      activeController?.beginTransaction?.(args?.reason, getUiState());
      if (DEBUG_SHEET_HISTORY) {
        // eslint-disable-next-line no-console
        console.info("[sheet-grid] onEditStart", args?.reason);
      }
      onEditStart?.(args as any);
    },
    [activeController, getUiState, onEditStart, DEBUG_SHEET_HISTORY]
  );

  const handleEditEnd = useCallback(
    (args: { reason: "typing" | "paste" | "delete" | "fill" }) => {
      if (activeController?.commitTransaction) {
        requestAnimationFrame(() => {
          activeController.commitTransaction?.(getUiState());
        });
      }
      if (DEBUG_SHEET_HISTORY) {
        // eslint-disable-next-line no-console
        console.info("[sheet-grid] onEditEnd", args?.reason);
      }
      onEditEnd?.(args as any);
    },
    [activeController, getUiState, onEditEnd, DEBUG_SHEET_HISTORY]
  );

  const handleChange = useMemo(() => {
    if (!resolvedOnChange) return undefined;
    if (!DEBUG_SHEET_HISTORY) return resolvedOnChange;
    return (next: T[], operations?: any) => {
      // eslint-disable-next-line no-console
      console.info("[sheet-grid] onChange", {
        rows: next.length,
        hasOperations: Boolean(operations?.length),
      });
      resolvedOnChange(next, operations as any);
    };
  }, [resolvedOnChange, DEBUG_SHEET_HISTORY]);

  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(e) => {
        const nextTarget = e.relatedTarget as Node | null;
        if (!wrapperRef.current?.contains(nextTarget)) {
          setIsFocused(false);
        }
      }}
    >
      {renderUndoRedo ? renderUndoRedo(undoRedoApi) : null}
      <RDG.DataSheetGrid
        ref={gridRef as any}
        value={resolvedValue as any}
        onChange={handleChange as any}
        rowClassName={resolvedRowClassName as any}
        height={height as any}
        style={{
          ...(style as CSSProperties),
          ...(height != null ? { height: "100%" } : {}),
        }}
        onActiveCellChange={handleActiveCellChange as any}
        onSelectionChange={handleSelectionChange as any}
        onEditStart={handleEditStart as any}
        onEditEnd={handleEditEnd as any}
        {...(gridProps as any)}
      />
    </div>
  );
}) as <T>(
  props: SheetGridProps<T> & {
    ref?: ForwardedRef<RDG.DataSheetGridRef>;
  }
) => JSX.Element;
