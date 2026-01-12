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
import { debugEnabled } from "~/utils/debugFlags";
import { useUndoableController } from "./useUndoableController";
import type { SheetRowId, SheetUiState } from "./SheetHistory";

type SheetGridProps<T> = Omit<RDG.DataSheetGridProps<T>, "value" | "onChange"> & {
  controller?: SheetController<T>;
  value?: T[];
  onChange?: RDG.DataSheetGridProps<T>["onChange"];
  undoable?: boolean;
  getRowId?: (row: T) => SheetRowId | null | undefined;
  isRowBlank?: (row: T) => boolean;
  onUndoRedo?: (action: "undo" | "redo") => void;
  hotkeysEnabled?: boolean;
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
    onUndoRedo,
    renderUndoRedo,
    hotkeysEnabled = true,
    ...rest
  }: SheetGridProps<T>,
  ref: ForwardedRef<RDG.DataSheetGridRef>
) {
  const baseController = controller
    ? { ...controller, ...(onChange ? { onChange } : {}) }
    : ({ value: value ?? [] } as any);
  const useInternalUndo = undoable && !!controller;
  const undoableController = useUndoableController(baseController, {
    enabled: useInternalUndo,
    getRowId,
    isRowBlank,
  });
  const activeController = controller
    ? useInternalUndo
      ? undoableController
      : controller
    : undefined;
  const resolvedValue = value ?? (activeController ? activeController.value : []);
  const resolvedOnChange =
    onChange ||
    (activeController
      ? activeController.onChange ||
        (activeController.setValue
          ? (next: T[]) => activeController.setValue?.(next)
          : undefined)
      : onChange);
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

  const triggerUndo = useCallback(
    (source: "hotkey" | "button") => {
      if (!activeController?.undo || !activeController?.canUndo) return;
      const ui = activeController.undo();
      activeController.onUndoRedo?.("undo", source);
      onUndoRedo?.("undo");
      requestAnimationFrame(() => restoreUiState(ui));
    },
    [activeController, onUndoRedo, restoreUiState]
  );

  const triggerRedo = useCallback(
    (source: "hotkey" | "button") => {
      if (!activeController?.redo || !activeController?.canRedo) return;
      const ui = activeController.redo();
      activeController.onUndoRedo?.("redo", source);
      onUndoRedo?.("redo");
      requestAnimationFrame(() => restoreUiState(ui));
    },
    [activeController, onUndoRedo, restoreUiState]
  );

  useEffect(() => {
    if (!controller) return;
    controller.triggerUndo = () => triggerUndo("button");
    controller.triggerRedo = () => triggerRedo("button");
  }, [controller, triggerUndo, triggerRedo]);

  useEffect(() => {
    if (!activeController?.undo && !activeController?.redo) return;
    if (!hotkeysEnabled) return;
    const handler = (e: KeyboardEvent) => {
      if (!hotkeysEnabled) return;
      if (!wrapperRef.current?.closest("[data-sheet-shell]")) return;
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
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[sheet-grid] keydown", {
          key,
          meta: e.metaKey,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
        });
      }
      if (key === "z" && e.shiftKey) {
        if (!activeController?.canRedo) return;
        e.preventDefault();
        e.stopPropagation();
        if (debugEnabled("DEBUG_SHEET_HISTORY")) {
          // eslint-disable-next-line no-console
          console.info("[sheet-grid] REDO trigger");
        }
        triggerRedo("hotkey");
      } else if (key === "z") {
        if (!activeController?.canUndo) return;
        e.preventDefault();
        e.stopPropagation();
        if (debugEnabled("DEBUG_SHEET_HISTORY")) {
          // eslint-disable-next-line no-console
          console.info("[sheet-grid] UNDO trigger");
        }
        triggerUndo("hotkey");
      } else if (key === "y") {
        if (!activeController?.canRedo) return;
        e.preventDefault();
        e.stopPropagation();
        if (debugEnabled("DEBUG_SHEET_HISTORY")) {
          // eslint-disable-next-line no-console
          console.info("[sheet-grid] REDO trigger");
        }
        triggerRedo("hotkey");
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    activeController?.undo,
    activeController?.redo,
    activeController?.canUndo,
    activeController?.canRedo,
    hotkeysEnabled,
    triggerUndo,
    triggerRedo,
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
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[RDG] editStart", args?.reason);
      }
      onEditStart?.(args as any);
    },
    [activeController, getUiState, onEditStart]
  );

  const handleEditEnd = useCallback(
    (args: { reason: "typing" | "paste" | "delete" | "fill" }) => {
      if (activeController?.commitTransaction) {
        requestAnimationFrame(() => {
          activeController.commitTransaction?.(getUiState());
        });
      }
      if (debugEnabled("DEBUG_SHEET_HISTORY")) {
        // eslint-disable-next-line no-console
        console.info("[RDG] editEnd", args?.reason);
      }
      onEditEnd?.(args as any);
    },
    [activeController, getUiState, onEditEnd]
  );

  const handlePasteCapture = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      const insideGrid =
        !!wrapperRef.current &&
        (!!target && wrapperRef.current.contains(target));
      if (debugEnabled("DEBUG_SHEET_PASTE")) {
        const tag = activeEl?.tagName || "UNKNOWN";
        const type =
          activeEl && "type" in activeEl ? String((activeEl as any).type || "") : "";
        // eslint-disable-next-line no-console
        console.info("[PASTE] activeElement", {
          tag,
          type,
          insideGrid,
        });
      }
      if (!insideGrid || !activeEl) return;
      if (!["INPUT", "TEXTAREA"].includes(activeEl.tagName)) return;
      const hasHtml = event.clipboardData?.types?.includes("text/html");
      const text = hasHtml
        ? event.clipboardData?.getData("text/html") ?? ""
        : event.clipboardData?.getData("text/plain") ??
          event.clipboardData?.getData("text") ??
          "";
      if (!text) return;
      const grid = gridRef.current as any;
      if (typeof grid?.pasteFromText !== "function") return;
      event.preventDefault();
      grid.pasteFromText(text, hasHtml ? "html" : "text");
    },
    []
  );

  const handleChange = useMemo(() => {
    if (!resolvedOnChange) return undefined;
    if (!debugEnabled("DEBUG_SHEET_HISTORY")) return resolvedOnChange;
    return (next: T[], operations?: any) => {
      // eslint-disable-next-line no-console
      console.info("[sheet-grid] onChange", {
        rows: next.length,
        hasOperations: Boolean(operations?.length),
      });
      resolvedOnChange(next, operations as any);
    };
  }, [resolvedOnChange]);

  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      onPasteCapture={handlePasteCapture}
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
