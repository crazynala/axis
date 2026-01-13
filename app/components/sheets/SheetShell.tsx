import { Group } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";
import type { SheetController } from "./SheetController";
import { SheetHeader } from "./SheetHeader";
import type { SheetViewSpec } from "~/base/sheets/sheetSpec";
import { SheetColumnPicker } from "~/base/sheets/SheetColumnPicker";
import {
  type SheetColumnSelectionState,
  type SheetColumnRelevanceMap,
  useSheetColumnSelection,
} from "~/base/sheets/useSheetColumns";

export function SheetShell({
  title,
  subtitle,
  controller,
  backTo,
  onDone,
  saveState = "idle",
  showStatus = true,
  rightExtra,
  columnPicker,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  controller?: SheetController<any>;
  backTo?: string;
  onDone?: () => void;
  saveState?: "idle" | "saving" | "error";
  showStatus?: boolean;
  rightExtra?: ReactNode;
  columnPicker?: {
    moduleKey: string;
    viewId: string;
    scope: string;
    viewSpec: SheetViewSpec<any>;
    rowsForRelevance?: any[];
    selection?: SheetColumnSelectionState<any>;
  };
  children: (bodyHeight: number) => ReactNode;
  footer?: ReactNode;
}) {
  const { ref: bodyRef, height: bodyHeight } = useElementSize();
  const pickerNode = columnPicker ? (
    <SheetColumnPickerSlot columnPicker={columnPicker} />
  ) : null;
  const headerExtra =
    pickerNode || rightExtra ? (
      <Group gap="xs" wrap="nowrap">
        {rightExtra}
        {pickerNode}
      </Group>
    ) : rightExtra;
  return (
    <div
      data-sheet-shell
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: "0 0 auto" }}>
        <SheetHeader
          title={title}
          subtitle={subtitle}
          controller={controller}
          backTo={backTo}
          onDone={onDone}
          saveState={saveState}
          showStatus={showStatus}
          rightExtra={headerExtra}
        />
      </div>
      <div
        ref={bodyRef}
        data-sheet-body
        style={{
          display: "flex",
          flexDirection: "column",
          flex: "1 1 auto",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {children(Math.max(0, bodyHeight || 0))}
      </div>
      <div style={{ flex: "0 0 auto" }}>{footer}</div>
    </div>
  );
}

function buildRelevanceByKey<Row>(
  viewSpec: SheetViewSpec<Row>,
  rows: Row[]
): SheetColumnRelevanceMap {
  const out: SheetColumnRelevanceMap = {};
  for (const col of viewSpec.columns) {
    if (!col.isRelevant) continue;
    const relevant = Boolean(col.isRelevant(rows));
    out[col.key] = {
      relevant,
      reason: relevant ? undefined : "Not applicable to any rows in this sheet",
    };
  }
  return out;
}

function SheetColumnPickerSlot({
  columnPicker,
}: {
  columnPicker: {
    moduleKey: string;
    viewId: string;
    scope: string;
    viewSpec: SheetViewSpec<any>;
    rowsForRelevance?: any[];
    selection?: SheetColumnSelectionState<any>;
  };
}) {
  const selection = columnPicker.selection
    ? columnPicker.selection
    : useSheetColumnSelection({
        moduleKey: columnPicker.moduleKey,
        viewId: columnPicker.viewId,
        scope: columnPicker.scope,
        viewSpec: columnPicker.viewSpec,
        relevanceByKey: buildRelevanceByKey(
          columnPicker.viewSpec,
          columnPicker.rowsForRelevance || []
        ),
      });
  return (
    <SheetColumnPicker
      columns={selection.columns}
      selectedKeys={selection.selectedKeys}
      onChange={selection.setSelectedKeys}
      defaultKeys={selection.defaultKeys}
      relevanceByKey={selection.relevanceByKey}
      widthPresetByKey={selection.widthPresetByKey}
      onWidthPresetChange={selection.setWidthPreset}
    />
  );
}
