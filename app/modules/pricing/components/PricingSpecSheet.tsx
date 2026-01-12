import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Column } from "react-datasheet-grid";
import * as RDG from "react-datasheet-grid";
import {
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useInitGlobalFormContext } from "@aa/timber";
import { useNavigate } from "@remix-run/react";
import { SheetShell } from "~/components/sheets/SheetShell";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import {
  padRowsWithDisableControls,
  guardColumnsWithDisableControls,
} from "~/components/sheets/disableControls";
import { useDataGrid } from "~/components/sheets/useDataGrid";
import {
  SheetExitButton,
  SheetSaveButton,
  useSheetDirtyPrompt,
} from "~/components/sheets/SheetControls";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { SheetGrid } from "~/components/sheets/SheetGrid";
import { adaptDataGridController } from "~/components/sheets/SheetController";
import {
  isPricingSpecRangeMeaningful,
  sanitizePricingSpecRanges,
  validatePricingSpecRanges,
  type PricingSpecRangeInput,
} from "~/modules/pricing/utils/pricingSpecRanges";

type RangeRow = PricingSpecRangeInput & {
  localKey: string;
  disableControls?: boolean;
};

type PricingSpecSheetProps = {
  mode: "new" | "edit";
  actionPath: string;
  exitUrl: string;
  initialName: string;
  initialRows: RangeRow[];
  title: string;
};

const nextLocalKey = (() => {
  let i = 1;
  return () => `range-${i++}`;
})();

const createBlankRow = (): RangeRow => ({
  id: null,
  rangeFrom: null,
  rangeTo: null,
  multiplier: null,
  localKey: nextLocalKey(),
  disableControls: false,
});


export function PricingSpecSheet({
  mode,
  actionPath,
  exitUrl,
  initialName,
  initialRows,
  title,
}: PricingSpecSheetProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(initialName || "");
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, string[]>>({});
  const gridRef = useRef<RDG.DataSheetGridRef>(null as any);
  const { ref: headerRef, height: headerHeight } = useElementSize();
  const { ref: footerRef, height: footerHeight } = useElementSize();

  const dataGrid = useDataGrid<RangeRow>({
    initialData: initialRows || [],
    getRowId: (row) => row.id ?? row.localKey,
    createRow: createBlankRow,
  });
  const sheetController = adaptDataGridController(dataGrid);

  const dirty = dataGrid.gridState.isDirty || name !== initialName;
  useSheetDirtyPrompt();

  const displayRows = useMemo(
    () =>
      padRowsWithDisableControls(
        dataGrid.value,
        DEFAULT_MIN_ROWS,
        () => createBlankRow(),
        { extraInteractiveRows: 1 }
      ),
    [dataGrid.value]
  );

  const nullableNumberColumn = {
    ...(RDG.textColumn as any),
    deleteValue: () => null,
    copyValue: ({ rowData }: any) =>
      rowData == null || rowData === "" ? "" : String(rowData),
    pasteValue: ({ value }: any) => {
      const raw = value == null ? "" : String(value).trim();
      if (raw === "") return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    },
  } as any;

  const sheetColumns = useMemo<Column<RangeRow>[]>(() => {
    const col = <K extends keyof RangeRow>(
      key: K,
      title: string
    ): Column<RangeRow> => ({
      ...((RDG.keyColumn as any)(key as any, nullableNumberColumn) as any),
      id: key as string,
      title,
    });
    return guardColumnsWithDisableControls([
      col("rangeFrom", "From Qty"),
      col("rangeTo", "To Qty"),
      col("multiplier", "Multiplier"),
    ]);
  }, []);

  const errorRowIndexes = useMemo(() => {
    const indexes = new Set<number>();
    Object.keys(rowErrors).forEach((idx) => indexes.add(Number(idx)));
    return indexes;
  }, [rowErrors]);

  const rowClassName = useCallback(
    ({ rowData, rowIndex }: { rowData: RangeRow; rowIndex: number }) => {
      const base = dataGrid.rowClassName({ rowData });
      const hasError = errorRowIndexes.has(rowIndex);
      return [base, hasError ? "sheet-row-error" : ""]
        .filter(Boolean)
        .join(" ");
    },
    [dataGrid, errorRowIndexes]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      try {
        gridRef.current?.stopEditing?.({ nextRow: false });
      } catch {}
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const rows = dataGrid.getValues();
      const sanitized = sanitizePricingSpecRanges(rows);
      const validation = validatePricingSpecRanges(sanitized);
      if (validation.hasErrors) {
        setRowErrors(validation.errorsByIndex);
        notifications.show({
          color: "red",
          title: "Fix sheet errors",
          message: "Please resolve highlighted rows before saving.",
        });
        return;
      }
      setRowErrors({});
      const meaningfulRows = sanitized.filter(isPricingSpecRangeMeaningful);
      const payload = {
        _intent: "pricingSpec.save",
        name,
        rows,
      };
      const resp = await fetch(actionPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        notifications.show({
          color: "red",
          title: "Save failed",
          message: data?.error || "Could not save pricing spec.",
        });
        return;
      }
      const msg = data?.ok
        ? `Saved: +${data.created || 0} / ~${data.updated || 0} / -${
            data.deleted || 0
          }`
        : "Saved";
      notifications.show({ color: "teal", title: "Saved", message: msg });
      dataGrid.commit();
      if (mode === "new" && data?.id) {
        navigate(`/admin/pricing-specs/${data.id}/sheet`);
      }
    } finally {
      setSaving(false);
    }
  }, [actionPath, dataGrid, mode, name, navigate]);

  const reset = useCallback(() => {
    dataGrid.reset();
    setName(initialName || "");
    setRowErrors({});
  }, [dataGrid, initialName]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty: dirty },
    }),
    [dirty, reset]
  );

  useInitGlobalFormContext(formHandlers as any, () => save(), reset);
  useEffect(() => {
    if (!dataGrid.value.length && !dirty) {
      dataGrid.setValue([createBlankRow()]);
    }
  }, [dataGrid, dirty]);

  return (
    <SheetShell
      title={title}
      left={<SheetExitButton to={exitUrl} />}
      right={<SheetSaveButton saving={saving} />}
    >
      {(bodyHeight) => (
        <SheetFrame gridHeight={bodyHeight}>
          {(gridHeight) => (
            <Stack gap="sm" style={{ height: "100%", minHeight: 0 }}>
              <style>{`.sheet-row-error { background-color: var(--mantine-color-red-0); }`}</style>
              <Group ref={headerRef} justify="space-between" wrap="wrap">
                <TextInput
                  label="Spec name"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  w={320}
                />
                {Object.keys(rowErrors).length ? (
                  <Text size="sm" c="red">
                    {Object.keys(rowErrors).length} row
                    {Object.keys(rowErrors).length === 1 ? "" : "s"} have errors
                  </Text>
                ) : null}
              </Group>
              <SheetGrid
                ref={gridRef as any}
                controller={sheetController}
                value={displayRows as any}
                onChange={dataGrid.onChange as any}
                columns={sheetColumns}
                rowClassName={rowClassName as any}
                height={Math.max(
                  0,
                  gridHeight - (headerHeight || 0) - (footerHeight || 0)
                )}
              />
              <Group ref={footerRef} justify="space-between">
                <Text size="xs" c="dimmed">
                  Paste from Excel or edit inline. Empty rows are ignored on save.
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() =>
                    dataGrid.setValue([...dataGrid.value, createBlankRow()])
                  }
                >
                  Add row
                </Button>
              </Group>
            </Stack>
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
