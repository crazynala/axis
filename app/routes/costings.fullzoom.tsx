import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { Button } from "@mantine/core";
import { useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import * as RDG from "react-datasheet-grid";
import type { Column } from "react-datasheet-grid";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInitGlobalFormContext } from "@aa/timber";
import { prismaBase } from "../utils/prisma.server";
import { FullzoomAppShell } from "~/components/sheets/FullzoomAppShell";
import { padToMinRows, DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";

export type CostingEditRow = {
  id: number; // costing id
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

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids: number[] = (idsParam || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (!ids.length) return json({ rows: [] });
  // Load costings for the provided assemblies, with product info
  const costings = await prismaBase.costing.findMany({
    where: { assemblyId: { in: ids } },
    orderBy: [{ productId: "asc" }, { assemblyId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      assemblyId: true,
      productId: true,
      quantityPerUnit: true,
      unitCost: true,
      activityUsed: true,
      product: { select: { sku: true, name: true } },
    },
  });
  // Load ordered breakdowns to approximate Required = (ordered - 0) * qpu
  const assemblies = await prismaBase.assembly.findMany({
    where: { id: { in: ids } },
    select: { id: true, qtyOrderedBreakdown: true },
  });
  const orderedByAsm = new Map<number, number>();
  for (const a of assemblies) {
    const arr = (a as any).qtyOrderedBreakdown as number[] | null;
    const ordered = Array.isArray(arr)
      ? arr.reduce((t, n) => t + (Number(n) || 0), 0)
      : 0;
    orderedByAsm.set(a.id, ordered);
  }
  const rows: CostingEditRow[] = costings.map((c) => {
    const qpu = Number(c.quantityPerUnit || 0) || 0;
    const ordered = orderedByAsm.get(c.assemblyId || 0) || 0;
    const required = ordered * qpu;
    return {
      id: c.id,
      assemblyId: c.assemblyId ?? null,
      productId: c.productId ?? null,
      productSku: c.product?.sku || "",
      productName: c.product?.name || "",
      activityUsed: String(c.activityUsed || ""),
      quantityPerUnit: qpu,
      unitCost: Number(c.unitCost || 0) || 0,
      required,
    } as CostingEditRow;
  });
  return json({ rows });
}

export async function action({ request }: ActionFunctionArgs) {
  const bodyText = await request.text();
  let payload: any = null;
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {}
  if (!payload || payload._intent !== "costings.batchSave")
    return json({ error: "Invalid intent" }, { status: 400 });
  const rows: CostingEditRow[] = Array.isArray(payload.rows)
    ? payload.rows
    : [];
  const updates = rows
    .map((r) => ({
      id: Number(r.id),
      qpu: Number(r.quantityPerUnit),
      activity: String(r.activityUsed || ""),
    }))
    .filter((r) => Number.isFinite(r.id));
  // Persist in series; low cardinality expected
  for (const u of updates) {
    const data: any = {};
    if (Number.isFinite(u.qpu)) data.quantityPerUnit = u.qpu;
    const act = u.activity?.toLowerCase?.();
    if (act === "cut" || act === "make") data.activityUsed = act;
    if (Object.keys(data).length) {
      await prismaBase.costing.update({ where: { id: u.id }, data });
    }
  }
  return json({ ok: true });
}

export default function CostingsFullzoom() {
  const { rows: initialRows } = useLoaderData<typeof loader>() as {
    rows: CostingEditRow[];
  };
  const navigate = useNavigate();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  // Controller for grid state
  const controller = RDG.useDataSheetController<CostingEditRow>(
    (initialRows || []).slice().sort((a, b) => {
      const pa = (a.productId ?? 0) - (b.productId ?? 0);
      if (pa !== 0) return pa;
      const aa = (a.assemblyId ?? 0) - (b.assemblyId ?? 0);
      if (aa !== 0) return aa;
      return (a.id ?? 0) - (b.id ?? 0);
    }),
    { sanitize: (list) => list.slice(), historyLimit: 200 }
  );
  const rows = controller.value;
  const setRows = controller.setValue;

  // Mark first row of each product block
  const markBlocks = useCallback((list: CostingEditRow[]) => {
    const out: CostingEditRow[] = [];
    let i = 0;
    while (i < list.length) {
      const pid = list[i].productId;
      let j = i;
      let first = true;
      while (j < list.length && list[j].productId === pid) {
        out.push({ ...list[j], groupStart: first });
        first = false;
        j++;
      }
      i = j;
    }
    return out;
  }, []);

  useEffect(() => {
    setRows(markBlocks(rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const col = useCallback(
    (
      key: keyof CostingEditRow,
      title: string,
      grow = 1,
      disabled = false
    ): Column<CostingEditRow> =>
      ({
        ...((RDG.keyColumn as any)(key as any, RDG.textColumn) as any),
        id: key as string,
        title,
        grow,
        disabled,
      } as any),
    []
  );

  const columns = useMemo<Column<CostingEditRow>[]>(() => {
    const productCol: Column<CostingEditRow> = {
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
    const assemblyCol = col("assemblyId", "Asm", 0.6, true);
    const idCol = col("id", "Costing ID", 0.8, true);
    const skuCol = col("productSku", "SKU", 1.1, true);
    const nameCol = col("productName", "Name", 1.6, true);
    const usageCol = col("activityUsed", "Usage", 0.9, false);
    const qpuCol = col("quantityPerUnit", "Qty/Unit", 0.9, false);
    const unitCostCol = col("unitCost", "Unit Cost", 1, true);
    const requiredCol = col("required", "Required", 0.9, true);
    return [
      productCol,
      assemblyCol,
      idCol,
      skuCol,
      nameCol,
      usageCol,
      qpuCol,
      unitCostCol,
      requiredCol,
    ];
  }, [col]);

  const onChange = useCallback(
    (next: CostingEditRow[]) => {
      // Strip any padded rows before committing to state
      const real = (next || []).filter((r: any) => Number.isFinite(r?.id));
      setRows(markBlocks(real as any));
    },
    [setRows, markBlocks]
  );

  const save = useCallback(async () => {
    const payload = { _intent: "costings.batchSave", rows };
    const resp = await fetch("/costings/fullzoom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      // eslint-disable-next-line no-alert
      alert("Save failed");
      return;
    }
    navigate(-1);
  }, [rows, navigate]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => controller.reset(initialRows || []),
      formState: { isDirty: controller.state.isDirty },
    }),
    [controller.state.isDirty, controller, initialRows]
  );
  useInitGlobalFormContext(
    formHandlers as any,
    () => save(),
    () => controller.reset(initialRows || [])
  );

  return (
    <FullzoomAppShell
      title="Batch Edit Costings"
      left={
        <Button variant="subtle" onClick={() => navigate(-1)}>
          Exit
        </Button>
      }
      right={<div />}
    >
      {(gridHeight) => {
        const displayRows = padToMinRows(
          rows,
          DEFAULT_MIN_ROWS,
          (last) =>
            ({
              ...(last || ({} as any)),
              // mark as padded with a non-finite id so it is filtered on change
              id: Number.NaN as any,
              groupStart: false,
            } as any)
        );
        return (
          <RDG.DataSheetGrid
            value={displayRows as any}
            onChange={onChange as any}
            columns={columns as any}
            height={gridHeight}
            getBlockKey={({
              rowData,
            }: {
              rowData: CostingEditRow;
              rowIndex: number;
            }) => rowData.productId ?? rowData.id}
            blockTopClassName="dsg-block-top"
          />
        );
      }}
    </FullzoomAppShell>
  );
}
