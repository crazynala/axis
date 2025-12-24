import { json, redirect } from "@remix-run/node";
import { useLoaderData, useParams, useRevalidator } from "@remix-run/react";
import ProductBomSpreadsheet from "../components/ProductBomSpreadsheet";
import type { BOMRow } from "../components/ProductBomSpreadsheet";
import { prismaBase } from "~/utils/prisma.server";
// no extra layout wrappers; FullzoomAppShell handles layout
import { FullzoomAppShell } from "~/components/sheets/FullzoomAppShell";
import { notifications } from "@mantine/notifications";
// import { useNavigate } from "@remix-run/react";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useInitGlobalFormContext } from "@aa/timber";
import {
  SheetExitButton,
  SheetSaveButton,
  useSheetDirtyPrompt,
} from "~/components/sheets/SheetControls";
import { Stack } from "@mantine/core";
import { ValueListType } from "@prisma/client";
import { CreateCmtFromBomHelper } from "../components/CreateCmtFromBomHelper";

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
  const hasCmtLine = (product.productLines || []).some(
    (pl: any) => pl.child?.type === "CMT" && !pl.flagAssemblyOmit
  );
  const categoryId = product.categoryId ?? null;
  const subCategoryId = product.subCategoryId ?? null;
  const [category, subCategory, subCategoryOptions, pricingSpecs] =
    await Promise.all([
      categoryId
        ? prismaBase.valueList.findUnique({
            where: { id: categoryId },
            select: { id: true, label: true, code: true },
          })
        : Promise.resolve(null),
      subCategoryId
        ? prismaBase.valueList.findUnique({
            where: { id: subCategoryId },
            select: { id: true, label: true, code: true },
          })
        : Promise.resolve(null),
      categoryId
        ? prismaBase.valueList.findMany({
            where: { type: ValueListType.Category, parentId: categoryId },
            orderBy: { label: "asc" },
            select: { id: true, label: true, code: true },
          })
        : Promise.resolve([]),
      prismaBase.pricingSpec.findMany({
        where: { curveFamily: { in: ["CMT_MOQ_50", "CMT_MOQ_100"] } },
        orderBy: { id: "asc" },
        select: { id: true, name: true, code: true, curveFamily: true },
      }),
    ]);

  const pricingSpecOptions = pricingSpecs.map((spec) => ({
    value: String(spec.id),
    label:
      spec.name ||
      (spec.curveFamily === "CMT_MOQ_50"
        ? "MOQ 50"
        : spec.curveFamily === "CMT_MOQ_100"
        ? "MOQ 100"
        : spec.code),
  }));

  const subCategorySelect = subCategoryOptions.map((opt) => ({
    value: String(opt.id),
    label: opt.label || opt.code || `#${opt.id}`,
  }));

  return json({
    rows,
    product: {
      id: product.id,
      name: product.name,
      type: product.type,
      categoryId,
      subCategoryId,
    },
    hasCmtLine,
    pricingSpecOptions,
    categoryLabel: category?.label || category?.code || null,
    subCategoryLabel: subCategory?.label || subCategory?.code || null,
    subCategoryOptions: subCategorySelect,
  });
}

export default function ProductBomRoute() {
  const {
    rows,
    product,
    hasCmtLine,
    pricingSpecOptions,
    categoryLabel,
    subCategoryLabel,
    subCategoryOptions,
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
  const revalidator = useRevalidator();

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
    <FullzoomAppShell
      title="Bill of Materials Spreadsheet"
      left={<SheetExitButton to={exitUrl} />}
      right={<SheetSaveButton saving={saving} />}
    >
      {(gridHeight) => (
        <Stack h={gridHeight} gap="md">
          <CreateCmtFromBomHelper
            parentProductId={productId}
            parentType={product?.type ?? null}
            parentCategoryId={product?.categoryId ?? null}
            parentSubCategoryId={product?.subCategoryId ?? null}
            categoryLabel={categoryLabel}
            subCategoryLabel={subCategoryLabel}
            hasCmtLine={hasCmtLine}
            pricingSpecOptions={pricingSpecOptions}
            subCategoryOptions={subCategoryOptions}
            onSuccess={() => {
              setRefreshOnNextRows(true);
              revalidator.revalidate();
            }}
          />
          <ProductBomSpreadsheet
            rows={editedRows}
            onSave={() => {}}
            loading={false}
            dirty={dirty}
            onRowsChange={setEditedRows}
            height={gridHeight - 72}
          />
        </Stack>
      )}
    </FullzoomAppShell>
  );
}
