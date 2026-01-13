import { useCallback, useRef } from "react";

type HoverState = {
  rowIdx: number | null;
  colIdx: number | null;
  rafId: number | null;
  nextRowIdx: number | null;
  nextColIdx: number | null;
};

const clearClasses = (
  root: HTMLElement,
  rowIdx: number | null,
  colIdx: number | null
) => {
  if (rowIdx != null) {
    root
      .querySelectorAll(`[data-cell-rowidx="${rowIdx}"]`)
      .forEach((node) => node.classList.remove("rg-hover-row"));
  }
  if (colIdx != null) {
    root
      .querySelectorAll(`[data-cell-colidx="${colIdx}"]`)
      .forEach((node) => node.classList.remove("rg-hover-col"));
  }
};

const applyClasses = (
  root: HTMLElement,
  rowIdx: number | null,
  colIdx: number | null
) => {
  if (rowIdx != null) {
    root
      .querySelectorAll(`[data-cell-rowidx="${rowIdx}"]`)
      .forEach((node) => node.classList.add("rg-hover-row"));
  }
  if (colIdx != null) {
    root
      .querySelectorAll(`[data-cell-colidx="${colIdx}"]`)
      .forEach((node) => node.classList.add("rg-hover-col"));
  }
};

export function useReactGridHover() {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<HoverState>({
    rowIdx: null,
    colIdx: null,
    rafId: null,
    nextRowIdx: null,
    nextColIdx: null,
  });

  const commitHover = useCallback(() => {
    const root = gridRef.current;
    if (!root) return;
    const state = hoverRef.current;
    const rowIdx = state.nextRowIdx;
    const colIdx = state.nextColIdx;
    state.rafId = null;
    if (rowIdx === state.rowIdx && colIdx === state.colIdx) return;
    clearClasses(root, state.rowIdx, state.colIdx);
    applyClasses(root, rowIdx, colIdx);
    state.rowIdx = rowIdx;
    state.colIdx = colIdx;
  }, []);

  const scheduleHover = useCallback(
    (rowIdx: number | null, colIdx: number | null) => {
      const state = hoverRef.current;
      state.nextRowIdx = rowIdx;
      state.nextColIdx = colIdx;
      if (state.rafId != null) return;
      state.rafId = window.requestAnimationFrame(commitHover);
    },
    [commitHover]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const root = gridRef.current;
      if (!root) return;
      const target = event.target as HTMLElement | null;
      const cell = target?.closest?.(".rg-cell") as HTMLElement | null;
      if (!cell || !root.contains(cell)) {
        scheduleHover(null, null);
        return;
      }
      const rowIdx = Number(cell.dataset.cellRowidx);
      const colIdx = Number(cell.dataset.cellColidx);
      const nextRowIdx = Number.isFinite(rowIdx) && rowIdx > 0 ? rowIdx : null;
      const nextColIdx = Number.isFinite(colIdx) && colIdx > 0 ? colIdx : null;
      scheduleHover(nextRowIdx, nextColIdx);
    },
    [scheduleHover]
  );

  const handlePointerLeave = useCallback(() => {
    scheduleHover(null, null);
  }, [scheduleHover]);

  return {
    gridRef,
    handlePointerMove,
    handlePointerLeave,
  };
}
