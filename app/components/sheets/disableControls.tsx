import type { CellProps, Column } from "react-datasheet-grid";
import { padToMinRows } from "./rowPadding";

type PlaceholderRenderer<T, C> = (props: CellProps<T, C>) => JSX.Element;

const defaultPlaceholder = <T, C>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: CellProps<T, C>
) => {
  return <div style={{ width: "100%", height: "100%" }} />;
};

type GuardedColumn<T, C, P> = Column<T, C, P>;

export function withDisableControlsGuard<
  T extends { disableControls?: boolean },
  C = any,
  P = any
>(
  column: GuardedColumn<T, C, P>,
  renderer: PlaceholderRenderer<T, C> = defaultPlaceholder
): GuardedColumn<T, C, P> {
  const BaseComponent =
    column.component ?? ((props: CellProps<T, C>) => renderer(props));
  const normalizedDisabled =
    typeof column.disabled === "function"
      ? column.disabled
      : () => Boolean(column.disabled);

  return {
    ...column,
    component: (props) => {
      if ((props.rowData as any)?.disableControls) {
        return renderer(props);
      }
      return BaseComponent(props);
    },
    disabled: (opt) =>
      Boolean((opt.rowData as any)?.disableControls) || normalizedDisabled(opt),
  };
}

export function guardColumnsWithDisableControls<
  T extends { disableControls?: boolean }
>(
  columns: GuardedColumn<T, any, any>[],
  renderer?: PlaceholderRenderer<T, any>
): GuardedColumn<T, any, any>[] {
  return columns.map((column) =>
    withDisableControlsGuard(column as GuardedColumn<T, any, any>, renderer)
  );
}

type PadOptions = { extraInteractiveRows?: number };

export function padRowsWithDisableControls<
  T extends { disableControls?: boolean }
>(
  rows: T[],
  minRows: number,
  createRow: (last: T | undefined, index: number) => T,
  options?: PadOptions
): T[] {
  const padded = padToMinRows(rows, minRows, createRow);
  const baseLength = rows.length;
  const extraInteractive = Math.max(0, options?.extraInteractiveRows ?? 0);
  const disableStart = baseLength + extraInteractive;
  if (padded.length <= disableStart) return padded;
  return padded.map((row, index) => {
    if (index < disableStart) return row;
    if ((row as any)?.disableControls) return row;
    return { ...row, disableControls: true };
  });
}
