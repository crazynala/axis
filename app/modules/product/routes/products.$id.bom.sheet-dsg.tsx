import { json, redirect } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";
import ProductBomSpreadsheet from "../components/ProductBomSpreadsheet";
import type { BOMRow } from "../components/ProductBomSpreadsheet";
import { prismaBase } from "~/utils/prisma.server";
// no extra layout wrappers; SheetShell handles layout
import { SheetShell } from "~/components/sheets/SheetShell";
import { notifications } from "@mantine/notifications";
// import { useNavigate } from "@remix-run/react";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useInitGlobalFormContext } from "@aa/timber";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { productSpec } from "~/modules/product/spec";

export async function loader({ params }: any) {
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  // Fetch product BOM lines and child info
  const product = await prismaBase.product.findUnique({
    where: { id },
    include: {
      productLines: {
        select: {
          id: true,
          quantity: true,
          activityUsed: true,
          flagAssemblyOmit: true,
          child: {
            select: {
              id: true,
              sku: true,
              name: true,
              type: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!product) return redirect("/products");
  const rows: BOMRow[] = (product.productLines || []).map((pl: any) => ({
    id: pl.id,
    childSku: pl.child?.sku || "",
    childName: pl.child?.name || "",
    activityUsed: pl.activityUsed || "",
    type: pl.child?.type || "",
    supplier: pl.child?.supplier?.name || "",
    quantity: Number(pl.quantity ?? 0) || 0,
  }));
  const categoryId = product.categoryId ?? null;
  const subCategoryId = product.subCategoryId ?? null;

  return json({
    rows,
    product: {
      id: product.id,
      name: product.name,
      type: product.type,
      categoryId,
      subCategoryId,
    },
  });
}

export default function ProductBomRoute() {
  const {
    rows,
    product,
  } = useLoaderData<typeof loader>();
  // const navigate = useNavigate();
  const params = useParams();
  const productId = Number(params.id);

  const [editedRows, setEditedRows] = useState<BOMRow[]>(rows);
  const [refreshOnNextRows, setRefreshOnNextRows] = useState(false);
  const [saving, setSaving] = useState(false);
  useSheetDirtyPrompt();
  const exitUrl = Number.isFinite(productId)
    ? `/products/${productId}`
    : "/products";
  const originalRef = useRef<BOMRow[]>(rows);
  const viewSpec = productSpec.sheet?.views["detail-bom"];
  if (!viewSpec) {
    throw new Error("Missing product sheet spec: detail-bom");
  }
  const columnSelection = useSheetColumnSelection({
    moduleKey: "products",
    viewId: viewSpec.id,
    scope: "detail",
    viewSpec,
  });

  useEffect(() => {
    if (!refreshOnNextRows) return;
    originalRef.current = rows;
    setEditedRows(rows);
    setRefreshOnNextRows(false);
  }, [refreshOnNextRows, rows]);

  type RowLite = {
    id: number | null;
    childSku: string;
    quantity?: any;
    activityUsed?: any;
  };
  const dirty = useMemo(() => {
    const a = (originalRef.current || []) as RowLite[];
    const b = (editedRows || []) as RowLite[];
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      const A = a[i];
      const B = b[i];
      if ((A.id || null) !== (B.id || null)) return true;
      if ((A.childSku || "") !== (B.childSku || "")) return true;
      if (String(A.quantity ?? "") !== String(B.quantity ?? "")) return true;
      if ((A.activityUsed || "") !== (B.activityUsed || "")) return true;
    }
    return false;
  }, [editedRows]);

  const save = useCallback(async () => {
    if (!Number.isFinite(productId)) return;
    setSaving(true);
    const origById = new Map<number, RowLite>();
    for (const r of originalRef.current as RowLite[])
      if (r.id != null) origById.set(r.id, r);
    const editedById = new Map<number, RowLite>();
    for (const r of editedRows as RowLite[])
      if (r.id != null) editedById.set(r.id, r);

    const deletes: number[] = [];
    for (const [id] of origById) if (!editedById.has(id)) deletes.push(id);

    const updates: Array<{
      id: number;
      quantity?: number;
      activityUsed?: string | null;
    }> = [];
    const creates: Array<{
      childSku: string;
      quantity?: number;
      activityUsed?: string | null;
    }> = [];

    for (const r of editedRows as RowLite[]) {
      if (r.id == null) {
        if (r.childSku) {
          creates.push({
            childSku: r.childSku,
            quantity: r.quantity === "" ? undefined : Number(r.quantity) || 0,
            activityUsed: r.activityUsed ? r.activityUsed : null,
          });
        }
      } else {
        const prev = origById.get(r.id);
        if (!prev) {
          if (r.childSku) {
            creates.push({
              childSku: r.childSku,
              quantity: r.quantity === "" ? undefined : Number(r.quantity) || 0,
              activityUsed: r.activityUsed ? r.activityUsed : null,
            });
          }
          continue;
        }
        if ((prev.childSku || "") !== (r.childSku || "")) {
          deletes.push(r.id);
          if (r.childSku) {
            creates.push({
              childSku: r.childSku,
              quantity: r.quantity === "" ? undefined : Number(r.quantity) || 0,
              activityUsed: r.activityUsed ? r.activityUsed : null,
            });
          }
        } else {
          const qtyChanged =
            String(prev.quantity ?? "") !== String(r.quantity ?? "");
          const usageChanged =
            (prev.activityUsed || "") !== (r.activityUsed || "");
          if (qtyChanged || usageChanged) {
            updates.push({
              id: r.id,
              ...(qtyChanged ? { quantity: Number(r.quantity) || 0 } : {}),
              ...(usageChanged ? { activityUsed: r.activityUsed || null } : {}),
            });
          }
        }
      }
    }

    const payload = {
      _intent: "bom.batch",
      creates,
      updates,
      deletes,
    } as const;
    try {
      const resp = await fetch(`/products/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        originalRef.current = editedRows;
        // trigger re-render so dirty recomputes to false
        setEditedRows((r) => [...r]);
        const msg = data?.ok
          ? `Saved: +${data.created || 0} / ~${data.updated || 0} / -${
              data.deleted || 0
            }`
          : `Saved`;
        const unknown = Array.isArray(data?.unknownSkus)
          ? data.unknownSkus.length
          : 0;
        notifications.show({
          color: unknown ? "yellow" : "teal",
          title: unknown ? "Saved with warnings" : "Saved",
          message: unknown
            ? `${msg}. ${unknown} unknown SKU${unknown === 1 ? "" : "s"}.`
            : msg,
        });
      } else {
        notifications.show({
          color: "red",
          title: "Save failed",
          message: "Could not save BOM changes.",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [editedRows, productId]);

  const reset = useCallback(() => {
    // clone to force re-render
    setEditedRows([...(originalRef.current || [])]);
  }, []);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty: dirty },
    }),
    [dirty, reset]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), reset);

  return (
    <SheetShell
      title="Bill of Materials Spreadsheet"
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      columnPicker={{
        moduleKey: "products",
        viewId: viewSpec.id,
        scope: "detail",
        viewSpec,
        rowsForRelevance: editedRows,
        selection: columnSelection,
      }}
    >
      {(bodyHeight) => (
        <SheetFrame gridHeight={bodyHeight}>
          {(gridHeight) => (
            <ProductBomSpreadsheet
              rows={editedRows}
              onSave={() => {}}
              loading={false}
              dirty={dirty}
              onRowsChange={setEditedRows}
              selectedColumnKeys={columnSelection.selectedKeys}
              height={gridHeight}
            />
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
