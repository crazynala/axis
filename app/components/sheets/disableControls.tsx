import { Tooltip } from "@mantine/core";
import type { CellProps, Column } from "react-datasheet-grid";
import type { SheetColumnDef } from "~/base/sheets/sheetSpec";
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

export function guardColumnsWithApplicability<
  T extends { disableControls?: boolean }
>(
  columns: GuardedColumn<T, any, any>[],
  defs: SheetColumnDef<T>[],
  renderer: PlaceholderRenderer<T, any> = (props) =>
    renderDisabledValue(props?.rowData)
): GuardedColumn<T, any, any>[] {
  const defsByKey = new Map(defs.map((def) => [def.key, def]));
  return columns.map((column) => {
    const def = defsByKey.get(String(column.id ?? ""));
    if (!def?.isApplicable) return column;
    const baseComponent =
      column.component ?? ((props: CellProps<T, any>) => renderer(props));
    const baseDisabled =
      typeof column.disabled === "function"
        ? column.disabled
        : () => Boolean(column.disabled);
    return {
      ...column,
      disabled: (opt) => {
        if (baseDisabled(opt)) return true;
        const row = opt.rowData as T;
        if (!row) return false;
        return !def.isApplicable?.(row);
      },
      component: (props) => {
        const row = props.rowData as T;
        if (row?.disableControls) return baseComponent(props);
        if (row && !def.isApplicable?.(row)) {
          const reason = def.getInapplicableReason?.(row) || "Not applicable";
          const content = renderDisabledCell(props, column, renderer);
          return (
            <Tooltip label={reason} withArrow>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  cursor: "not-allowed",
                  color: "var(--mantine-color-gray-6)",
                  display: "flex",
                  alignItems: "center",
                }}
                tabIndex={0}
              >
                {content}
              </div>
            </Tooltip>
          );
        }
        return baseComponent(props);
      },
    } as GuardedColumn<T, any, any>;
  });
}

function renderDisabledValue(value: any) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "");
  const display = isEmpty ? "N/A" : String(value);
  return (
    <div style={{ width: "100%", height: "100%", padding: "0 6px" }}>
      {display}
    </div>
  );
}

function renderDisabledCell<T>(
  props: CellProps<T, any>,
  column: GuardedColumn<T, any, any>,
  renderer: PlaceholderRenderer<T, any>
) {
  const row = props.rowData as any;
  const key = column.id != null ? String(column.id) : null;
  if (key && row && typeof row === "object" && key in row) {
    return renderDisabledValue(row[key]);
  }
  return renderer(props);
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
