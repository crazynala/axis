import { Card, Group, Title } from "@mantine/core";
import { useMemo, useRef, useCallback, type ReactNode, useEffect } from "react";
import * as RDG from "react-datasheet-grid";
import type { Column } from "react-datasheet-grid";
import type { CostingRow } from "~/modules/job/components/AssemblyCostingsTable";
import { SheetGrid } from "~/components/sheets/SheetGrid";
import { adaptRdgController } from "~/components/sheets/SheetController";

export type CostingGridRow = {
  costingId: number;
  assemblyId: number | null;
  productId: number | null;
  productSku: string;
  productName: string;
  activityUsed: string;
  quantityPerUnit: number | string;
  unitCost: number | string;
  required: number | string;
  groupStart?: boolean;
};

export function CostingsGrid(props: {
  title?: string;
  rows: CostingRow[];
  actions?: ReactNode | ReactNode[];
  // Callbacks to update parent RHF form state for save payloads
  setQpu?: (id: number, value: number) => void;
  setActivity?: (id: number, value: string) => void;
}) {
  const {
    title = "Costings (Spreadsheet)",
    rows,
    actions,
    setActivity,
    setQpu,
  } = props;

  const toGridRows = useCallback((list: CostingRow[]): CostingGridRow[] => {
    const base: CostingGridRow[] = (list || [])
      .slice()
      .sort((a, b) => {
        const pa = (a.productId ?? 0) - (b.productId ?? 0);
        if (pa !== 0) return pa;
        const aa = (a.assemblyId ?? 0) - (b.assemblyId ?? 0);
        if (aa !== 0) return aa;
        return a.id - b.id;
      })
      .map((r) => ({
        costingId: r.id,
        assemblyId: (r.assemblyId as any) ?? null,
        productId: r.productId ?? null,
        productSku: r.sku || "",
        productName: r.name || "",
        activityUsed: String(r.activityUsed || ""),
        quantityPerUnit:
          typeof r.quantityPerUnit === "number"
            ? r.quantityPerUnit
            : Number(r.quantityPerUnit || 0) || "",
        unitCost:
          typeof r.unitCost === "number"
            ? r.unitCost
            : Number(r.unitCost || 0) || "",
        required:
          typeof r.required === "number"
            ? r.required
            : Number(r.required || 0) || "",
      }));
    // mark groupStart for first row of each productId contiguous block
    const out: CostingGridRow[] = [];
    let i = 0;
    while (i < base.length) {
      const pid = base[i].productId;
      let j = i;
      let first = true;
      while (j < base.length && base[j].productId === pid) {
        out.push({ ...base[j], groupStart: first });
        first = false;
        j++;
      }
      i = j;
    }
    return out;
  }, []);

  const controller = RDG.useDataSheetController<CostingGridRow>(
    toGridRows(rows || []),
    {
      sanitize: (list) => list.slice(),
      historyLimit: 200,
    }
  );
  const sheetController = adaptRdgController(controller);

  // Keep controller in sync when props.rows change meaningfully
  const prevRowsRef = useRef<CostingGridRow[]>(toGridRows(rows || []));
  useEffect(() => {
    const next = toGridRows(rows || []);
    try {
      const curr = controller.getValue();
      const same = JSON.stringify(curr) === JSON.stringify(next);
      if (!same) controller.reset(next);
    } catch {
      controller.reset(next);
    }
    prevRowsRef.current = controller.getValue();
  }, [rows, controller, toGridRows]);

  const value = controller.value;

  const columns = useMemo<Column<CostingGridRow>[]>(() => {
    const productCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("productName" as any, RDG.textColumn) as any),
      id: "product",
      title: "Product",
      grow: 1.8,
      component: ({ rowData }: any) => (
        <span>
          {rowData.groupStart
            ? `${rowData.productSku || ""} — ${rowData.productName || ""}`
            : ""}
        </span>
      ),
      disabled: true,
    } as any;
    const assemblyCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("assemblyId" as any, RDG.textColumn) as any),
      id: "assembly",
      title: "Asm",
      grow: 0.6,
      component: ({ rowData }: any) => (
        <span>{rowData.assemblyId ? `A${rowData.assemblyId}` : ""}</span>
      ),
      disabled: true,
    } as any;
    const idCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("costingId" as any, RDG.textColumn) as any),
      id: "id",
      title: "Costing ID",
      grow: 0.8,
      disabled: true,
    } as any;
    const skuCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("productSku" as any, RDG.textColumn) as any),
      id: "sku",
      title: "SKU",
      grow: 1.1,
      disabled: true,
    } as any;
    const nameCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("productName" as any, RDG.textColumn) as any),
      id: "name",
      title: "Name",
      grow: 1.6,
      disabled: true,
    } as any;
    const activityCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("activityUsed" as any, RDG.textColumn) as any),
      id: "activityUsed",
      title: "Usage",
      grow: 0.9,
    } as any;
    const qpuCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)(
        "quantityPerUnit" as any,
        RDG.textColumn
      ) as any),
      id: "quantityPerUnit",
      title: "Qty/Unit",
      grow: 0.9,
    } as any;
    const unitCostCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("unitCost" as any, RDG.textColumn) as any),
      id: "unitCost",
      title: "Unit Cost",
      grow: 1,
      disabled: true,
    } as any;
    const requiredCol: Column<CostingGridRow> = {
      ...((RDG.keyColumn as any)("required" as any, RDG.textColumn) as any),
      id: "required",
      title: "Required",
      grow: 0.9,
      disabled: true,
    } as any;

    return [
      productCol,
      assemblyCol,
      idCol,
      skuCol,
      nameCol,
      activityCol,
      qpuCol,
      unitCostCol,
      requiredCol,
    ];
  }, []);

  const onChange = useCallback(
    (next: CostingGridRow[]) => {
      const prev = prevRowsRef.current || [];
      // detect field changes and propagate to RHF setters if provided
      for (let i = 0; i < next.length; i++) {
        const a = prev[i];
        const b = next[i];
        if (!a || !b) continue;
        if (
          a.activityUsed !== b.activityUsed &&
          typeof setActivity === "function"
        ) {
          const id = Number(b.costingId);
          setActivity(id, String(b.activityUsed || ""));
        }
        if (
          a.quantityPerUnit !== b.quantityPerUnit &&
          typeof setQpu === "function"
        ) {
          const id = Number(b.costingId);
          const val = Number(b.quantityPerUnit);
          if (Number.isFinite(val)) setQpu(id, val);
        }
      }
      prevRowsRef.current = next;
      controller.setValue(next);
    },
    [controller, setActivity, setQpu]
  );

  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>{title}</Title>
          {actions ? (
            <Group gap="xs">
              {Array.isArray(actions)
                ? actions.map((node, i) => <span key={`act-${i}`}>{node}</span>)
                : actions}
            </Group>
          ) : null}
        </Group>
      </Card.Section>
      <div>
        <SheetGrid
          controller={sheetController}
          value={value as any}
          onChange={onChange as any}
          columns={columns as any}
          // Visual blocks by product id, no auto insert to avoid creating rows that server can't save yet
          getBlockKey={({
            rowData,
          }: {
            rowData: CostingGridRow;
            rowIndex: number;
          }) => rowData.productId ?? rowData.costingId}
          debugBlocks
          blockTopClassName="dsg-block-top"
        />
      </div>
    </Card>
  );
}
