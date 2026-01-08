import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import {
  Outlet,
  useFetcher,
  useRouteLoaderData,
  useSubmit,
  useRevalidator,
  Link,
  useActionData,
} from "@remix-run/react";
import {
  prisma,
  refreshProductStockSnapshot,
} from "../../../utils/prisma.server";
import { requireUserId } from "~/utils/auth.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import {
  Card,
  Grid,
  Group,
  Stack,
  Title,
  Table,
  Tabs,
  Button,
  Badge,
  ScrollArea,
  TextInput,
  Text,
  Menu,
  ActionIcon,
  Drawer,
  Tooltip,
  Alert,
  SegmentedControl,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { Controller, useForm, useWatch, FormProvider } from "react-hook-form";
import { NumberInput } from "@mantine/core";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import { PurchaseOrderDetailForm } from "~/modules/purchaseOrder/forms/PurchaseOrderDetailForm";
import { ProductStageIndicator } from "~/modules/product/components/ProductStageIndicator";
// Using an async product search in this route instead of the shared ProductSelect
import { useState, useEffect, useRef, useMemo } from "react";
import { useRecordContext } from "../../../base/record/RecordContext";
import { formatUSD } from "../../../utils/format";
import { POReceiveModal } from "../../../components/POReceiveModal";
import { marshallPurchaseOrderToPrisma } from "../helpers/purchaseOrderMarshallers";
import { ProductPricingService } from "~/modules/product/services/ProductPricingService";
// calcPrice no longer used in this route; pricing handled in lines table
import { PurchaseOrderLinesTable } from "~/modules/purchaseOrder/components/PurchaseOrderLinesTable";
import { trimReservationsToExpected } from "~/modules/materials/services/reservations.server";
import { getSavedIndexSearch } from "~/hooks/useNavLocation";
import { computeLinePricing } from "~/modules/purchaseOrder/helpers/poPricing";
import { IconMenu2, IconTrash, IconFileExport } from "@tabler/icons-react";
import { VariantBreakdownSection } from "../../../components/VariantBreakdownSection";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { purchaseOrderStateConfig } from "~/base/state/configs";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import {
  FormStateDebugPanel,
  buildFormStateDebugData,
  buildFormStateDebugText,
} from "~/base/debug/FormStateDebugPanel";
import { AxisChip } from "~/components/AxisChip";
import { JumpLink } from "~/components/JumpLink";
import {
  groupVariantBreakdowns,
  resolveVariantSourceFromLine,
} from "../../../utils/variantBreakdown";
import { buildPurchaseOrderWarnings } from "~/modules/purchaseOrder/spec/warnings";

const parseDateInput = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeTaxRate = (
  value: Prisma.Decimal | number | string | null | undefined
) => {
  const dec = new Prisma.Decimal(value ?? 0);
  if (dec.greaterThan(1)) return dec.div(100);
  return dec;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.purchaseOrder
      ? `PO ${data.purchaseOrder.id}`
      : "Purchase Order",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              type: true,
              stockTrackingEnabled: true,
              batchTrackingEnabled: true,
              purchaseTax: true,
              variantSet: { select: { id: true, name: true, variants: true } },
            },
          },
          etaConfirmedByUser: { select: { id: true, name: true, email: true } },
          assembly: {
            select: {
              id: true,
              name: true,
              variantSetId: true,
              qtyOrderedBreakdown: true,
              variantSet: { select: { id: true, name: true, variants: true } },
            },
          },
        },
      },
      company: { select: { name: true, defaultLeadTimeDays: true } },
      consignee: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!purchaseOrder) return redirect("/purchase-orders");

  // Derive received from ShipmentLines (PO receipts); movements remain secondary
  const lineIds = (purchaseOrder.lines || []).map((l: any) => l.id);
  const productMovementCount = lineIds.length
    ? await prisma.productMovement.count({
        where: { purchaseOrderLineId: { in: lineIds } },
      })
    : 0;
  let receivedByLine = new Map<number, number>();
  if (lineIds.length) {
    const receiptLines = await prisma.shipmentLine.findMany({
      where: {
        purchaseOrderLineId: { in: lineIds },
        shipment: { type: "In" },
      },
      select: { purchaseOrderLineId: true, quantity: true },
    });
    for (const sl of receiptLines) {
      const lid = sl.purchaseOrderLineId as number;
      const qty = Number(sl.quantity || 0);
      if (!Number.isFinite(lid)) continue;
      receivedByLine.set(lid, (receivedByLine.get(lid) || 0) + qty);
    }
  }
  let shippedByLine = new Map<number, number>();
  if (lineIds.length) {
    const mls = await prisma.productMovementLine.findMany({
      where: {
        purchaseOrderLineId: { in: lineIds },
      },
      select: {
        purchaseOrderLineId: true,
        quantity: true,
        movement: { select: { movementType: true } },
      },
    });
    for (const ml of mls) {
      const lid = ml.purchaseOrderLineId as number;
      const qty = Number(ml.quantity || 0);
      const t = (ml.movement?.movementType || "").toLowerCase();
      if (t === "po (ship)") {
        shippedByLine.set(lid, (shippedByLine.get(lid) || 0) + qty);
      }
    }
  }
  const lineReservations = lineIds.length
    ? await prisma.supplyReservation.findMany({
        where: { purchaseOrderLineId: { in: lineIds } },
        include: {
          assembly: {
            select: {
              id: true,
              name: true,
              job: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ id: "asc" }],
      })
    : [];
  const reservationsByLine = new Map<number, any[]>();
  lineReservations.forEach((res) => {
    const lineId = res.purchaseOrderLineId;
    if (!lineId) return;
    const arr = reservationsByLine.get(lineId) || [];
    arr.push({
      ...res,
      qtyReserved: Number(res.qtyReserved || 0),
    });
    reservationsByLine.set(lineId, arr);
  });
  const linesWithComputed = (purchaseOrder.lines || []).map((l: any) => {
    const qtyReceived = receivedByLine.get(l.id) || 0;
    const qtyOrdered = Number(l.quantityOrdered ?? 0) || 0;
    const qtyExpected = resolveExpectedQty(l);
    const reservations = reservationsByLine.get(l.id) || [];
    const activeReservations = reservations.filter((res) => !res.settledAt);
    const reservedQty = activeReservations.reduce(
      (sum, res) => sum + (Number(res.qtyReserved) || 0),
      0
    );
    return {
      ...l,
      qtyReceived,
      qtyShipped: shippedByLine.get(l.id) || 0,
      reservations,
      reservedQty,
      qtyExpected,
      availableQty: Math.max(qtyExpected - qtyReceived - reservedQty, 0),
    };
  });

  const poWithComputed = {
    ...purchaseOrder,
    lines: linesWithComputed,
  } as typeof purchaseOrder;

  const totals = (poWithComputed.lines || []).reduce(
    (acc: any, l: any) => {
      const qty = Number(l.quantity ?? 0);
      const qtyOrd = Number(l.quantityOrdered ?? 0);
      const computed = computeLinePricing({
        product: l.product || null,
        qtyOrdered: l.quantityOrdered,
        pricingPrefs: null,
      });
      const cost = Number(l.manualCost ?? l.priceCost ?? computed.cost ?? 0);
      const sell = Number(l.manualSell ?? l.priceSell ?? computed.sell ?? 0);
      acc.qty += qty;
      acc.qtyOrdered += qtyOrd;
      acc.cost += cost * qty;
      acc.sell += sell * qty;
      return acc;
    },
    { qty: 0, qtyOrdered: 0, cost: 0, sell: 0 }
  );

  // Do not preload thousands of products; the Add Line modal will use /api.products.search
  const productOptions: Array<{
    value: number;
    label: string;
    sku?: string | null;
    name?: string | null;
  }> = [];

  // Fetch related Product Movements (headers + lines) tied to this PO's lines (secondary data)
  let poMovements: Array<any> = [];
  if (lineIds.length) {
    poMovements = await prisma.productMovement.findMany({
      where: {
        purchaseOrderLineId: { in: lineIds },
      },
      select: {
        id: true,
        date: true,
        movementType: true,
        purchaseOrderLineId: true,
        quantity: true,
        notes: true,
        // locationId relation isn't used for PO receive; we enforce PO.locationId via locationInId scalar
        lines: {
          select: {
            id: true,
            quantity: true,
            purchaseOrderLineId: true,
            product: { select: { sku: true, name: true } },
            batch: {
              select: {
                id: true,
                codeMill: true,
                codeSartor: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
  }

  // Receipt shipments (type IN) associated with this PO via ShipmentLine.purchaseOrderLineId
  const receiptShipments = lineIds.length
    ? await prisma.shipment.findMany({
        where: {
          type: "In",
          lines: { some: { purchaseOrderLineId: { in: lineIds } } },
        },
        select: {
          id: true,
          date: true,
          memo: true,
          lines: {
            where: { purchaseOrderLineId: { in: lineIds } },
            select: {
              id: true,
              purchaseOrderLineId: true,
              productId: true,
              quantity: true,
              product: { select: { sku: true, name: true } },
            },
          },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      })
    : [];
  const receiptLineIds = receiptShipments.flatMap((s) =>
    (s.lines || []).map((l) => l.id)
  );
  const receiptLineMeta: Record<
    number,
    {
      batches: Array<{
        id: number;
        codeMill?: string | null;
        codeSartor?: string | null;
        name?: string | null;
        quantity?: number | null;
      }>;
      movementCount: number;
    }
  > = {};
  if (receiptLineIds.length) {
    const movementLines = await prisma.productMovementLine.findMany({
      where: {
        movement: { shippingLineId: { in: receiptLineIds } },
      },
      select: {
        quantity: true,
        batch: {
          select: { id: true, codeMill: true, codeSartor: true, name: true },
        },
        movement: { select: { id: true, shippingLineId: true } },
      },
    });
    const batchesByLine = new Map<number, typeof movementLines>();
    const movementsByLine = new Map<number, Set<number>>();
    for (const ml of movementLines) {
      const lineId = Number(ml.movement?.shippingLineId || 0);
      if (!Number.isFinite(lineId) || !lineId) continue;
      if (ml.batch) {
        const list = batchesByLine.get(lineId) || [];
        list.push(ml);
        batchesByLine.set(lineId, list);
      }
      if (ml.movement?.id) {
        const set = movementsByLine.get(lineId) || new Set<number>();
        set.add(Number(ml.movement.id));
        movementsByLine.set(lineId, set);
      }
    }
    for (const lineId of receiptLineIds) {
      const batches =
        batchesByLine.get(lineId)?.map((ml) => ({
          id: ml.batch?.id as number,
          codeMill: ml.batch?.codeMill ?? null,
          codeSartor: ml.batch?.codeSartor ?? null,
          name: ml.batch?.name ?? null,
          quantity: Number(ml.quantity || 0) || 0,
        })) || [];
      receiptLineMeta[lineId] = {
        batches,
        movementCount: movementsByLine.get(lineId)?.size || 0,
      };
    }
  }

  const supplierInvoices = await prisma.supplierInvoice.findMany({
    where: { purchaseOrderId: id },
    select: {
      id: true,
      invoiceDate: true,
      supplierInvoiceNo: true,
      type: true,
      totalExTax: true,
      taxCode: true,
    },
    orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
  });
  const toDecimal = (
    value: Prisma.Decimal | number | string | null | undefined
  ) => new Prisma.Decimal(value ?? 0);
  let expectedExSum = new Prisma.Decimal(0);
  let expectedTaxSum = new Prisma.Decimal(0);
  for (const l of linesWithComputed || []) {
    const qtyReceived = toDecimal(l.qtyReceived ?? 0);
    const computed = computeLinePricing({
      product: l.product || null,
      qtyOrdered: l.quantityOrdered,
      pricingPrefs: null,
    });
    const unitCost = toDecimal(
      l.manualCost ?? l.priceCost ?? computed.cost ?? 0
    );
    const taxRate = normalizeTaxRate(
      l.taxRate ?? l.product?.purchaseTax?.value ?? 0
    );
    const lineEx = qtyReceived.mul(unitCost);
    const lineEx2 = lineEx.toDecimalPlaces(2);
    const lineTax = lineEx2.mul(taxRate);
    const lineTax2 = lineTax.toDecimalPlaces(2);
    expectedExSum = expectedExSum.plus(lineEx2);
    expectedTaxSum = expectedTaxSum.plus(lineTax2);
  }
  const invoiceTaxCodes = Array.from(
    new Set(
      (supplierInvoices || [])
        .map((inv: any) => (inv.taxCode || "").toString().trim())
        .filter(Boolean)
    )
  );
  const expectedIncSum = expectedExSum.plus(expectedTaxSum);
  const effectiveRate = expectedExSum.eq(0)
    ? new Prisma.Decimal(0)
    : expectedTaxSum.div(expectedExSum);
  const taxCodeRates = invoiceTaxCodes.length
    ? await prisma.valueList.findMany({
        where: {
          type: "Tax",
          code: { in: invoiceTaxCodes },
        },
        select: { code: true, value: true },
      })
    : [];
  const taxRateByCode = new Map(
    taxCodeRates.map((t) => [String(t.code), t.value ?? null])
  );

  let invoicedSum = new Prisma.Decimal(0);
  let invoicedIncSum = new Prisma.Decimal(0);
  for (const inv of supplierInvoices || []) {
    const amt = toDecimal(inv.totalExTax ?? 0).toDecimalPlaces(2);
    invoicedSum =
      inv.type === "CREDIT_MEMO"
        ? invoicedSum.minus(amt)
        : invoicedSum.plus(amt);
    const code = (inv.taxCode || "").toString().trim();
    const rate = code ? taxRateByCode.get(code) : null;
    const normRate = rate != null ? normalizeTaxRate(rate) : null;
    const incRaw =
      normRate != null
        ? amt.mul(new Prisma.Decimal(1).plus(normRate))
        : amt.mul(new Prisma.Decimal(1).plus(effectiveRate));
    const inc = incRaw.toDecimalPlaces(2);
    invoicedIncSum =
      inv.type === "CREDIT_MEMO"
        ? invoicedIncSum.minus(inc)
        : invoicedIncSum.plus(inc);
  }
  // invoicedIncSum computed per invoice when taxCode is available; fallback uses effectiveRate
  const expectedInc2 = expectedIncSum.toDecimalPlaces(2);
  const invoicedInc2 = invoicedIncSum.toDecimalPlaces(2);
  const deltaInc2 = invoicedInc2.minus(expectedInc2);
  const expectedExTax = expectedExSum.toDecimalPlaces(2).toNumber();
  const expectedTax = expectedTaxSum.toDecimalPlaces(2).toNumber();
  const expectedIncTax = expectedInc2.toNumber();
  const invoicedExTax = invoicedSum.toDecimalPlaces(2).toNumber();
  const invoicedIncTax = invoicedInc2.toNumber();
  const deltaIncTax = deltaInc2.toNumber();
  const effectiveTaxRate = effectiveRate.toNumber();

  let accountingExtCost = new Prisma.Decimal(0);
  let accountingExtSell = new Prisma.Decimal(0);
  let accountingRealCost = new Prisma.Decimal(0);
  let accountingRealSell = new Prisma.Decimal(0);
  for (const l of linesWithComputed || []) {
    const qtyOrdered = toDecimal(l.quantityOrdered ?? 0);
    const qtyReceived = toDecimal(l.qtyReceived ?? 0);
    const computed = computeLinePricing({
      product: l.product || null,
      qtyOrdered: l.quantityOrdered,
      pricingPrefs: null,
    });
    const unitCost = toDecimal(
      l.manualCost ?? l.priceCost ?? computed.cost ?? 0
    );
    const unitSell = toDecimal(
      l.manualSell ?? l.priceSell ?? computed.sell ?? 0
    );
    const taxRate = normalizeTaxRate(
      l.taxRate ?? l.product?.purchaseTax?.value ?? 0
    );
    const unitCostInc = unitCost.mul(new Prisma.Decimal(1).plus(taxRate));
    const unitSellInc = unitSell.mul(new Prisma.Decimal(1).plus(taxRate));
    const lineExtCost = qtyOrdered.mul(unitCostInc).toDecimalPlaces(2);
    const lineExtSell = qtyOrdered.mul(unitSellInc).toDecimalPlaces(2);
    const lineRealCost = qtyReceived.mul(unitCostInc).toDecimalPlaces(2);
    const lineRealSell = qtyReceived.mul(unitSellInc).toDecimalPlaces(2);
    accountingExtCost = accountingExtCost.plus(lineExtCost);
    accountingExtSell = accountingExtSell.plus(lineExtSell);
    accountingRealCost = accountingRealCost.plus(lineRealCost);
    accountingRealSell = accountingRealSell.plus(lineRealSell);
  }
  let accountingInvoicedInc = new Prisma.Decimal(0);
  for (const inv of supplierInvoices || []) {
    const amt = toDecimal(inv.totalExTax ?? 0).toDecimalPlaces(2);
    const code = (inv.taxCode || "").toString().trim();
    const rate = code ? taxRateByCode.get(code) : null;
    const normRate = rate != null ? normalizeTaxRate(rate) : null;
    const inc = (normRate != null
      ? amt.mul(new Prisma.Decimal(1).plus(normRate))
      : amt.mul(new Prisma.Decimal(1).plus(effectiveRate))
    ).toDecimalPlaces(2);
    accountingInvoicedInc =
      inv.type === "CREDIT_MEMO"
        ? accountingInvoicedInc.minus(inc)
        : accountingInvoicedInc.plus(inc);
  }
  const accountingDeltaInc = accountingInvoicedInc
    .minus(accountingRealCost)
    .toDecimalPlaces(2);

  return json({
    purchaseOrder: poWithComputed,
    totals,
    productOptions,
    poMovements,
    receiptShipments,
    receiptLineMeta,
    supplierInvoices,
    invoiceSummary: {
      expectedExTax,
      expectedTax,
      expectedIncTax,
      invoicedExTax,
      invoicedIncTax,
      deltaIncTax,
      effectiveTaxRate,
    },
    accountingSummary: {
      extCost: accountingExtCost.toNumber(),
      extSell: accountingExtSell.toNumber(),
      realCost: accountingRealCost.toNumber(),
      realSell: accountingRealSell.toNumber(),
      invoicedInc: accountingInvoicedInc.toNumber(),
      deltaInc: accountingDeltaInc.toNumber(),
    },
    productMovementCount,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw ? Number(idRaw) : NaN;
  const form = await request.formData();
  console.log("PO action", form);
  const intent = String(form.get("_intent") || "");
  if (isNew || intent === "po.create") {
    const raw = String(form.get("purchaseOrder") || "{}");
    const data = marshallPurchaseOrderToPrisma(JSON.parse(raw));
    if (!data.locationId && data.consigneeCompanyId) {
      const consignee = await prisma.company.findUnique({
        where: { id: Number(data.consigneeCompanyId) },
        select: { stockLocationId: true },
      });
      data.locationId = consignee?.stockLocationId ?? 1;
    }
    const max = await prisma.purchaseOrder.aggregate({ _max: { id: true } });
    const nextId = (max._max.id || 0) + 1;
    const created = await prisma.purchaseOrder.create({
      data: { id: nextId, ...data, status: (data as any).status ?? "DRAFT" },
    } as any);
    return redirect(`/purchase-orders/${created.id}`);
  }
  if (intent === "po.delete") {
    if (!Number.isFinite(id)) {
      return json({ ok: false, error: "Invalid PO id" }, { status: 400 });
    }
    const confirmText = String(form.get("confirm") ?? "");
    const deletePhrase = "THIS IS BONKERS";
    if (confirmText !== deletePhrase) {
      return json(
        {
          ok: false,
          intent: "po.delete",
          error: "Confirmation text did not match.",
        },
        { status: 400 }
      );
    }
    const lineIds = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: id },
      select: { id: true },
    });
    const lineIdList = lineIds.map((l) => l.id);
    const movementCount = lineIdList.length
      ? await prisma.productMovement.count({
          where: { purchaseOrderLineId: { in: lineIdList } },
        })
      : 0;
    if (movementCount > 0) {
      return json(
        {
          ok: false,
          intent: "po.delete",
          error:
            "Cannot delete a purchase order that has product movements. Reverse/void the movements first.",
        },
        { status: 400 }
      );
    }
    await prisma.$transaction(async (tx) => {
      if (lineIdList.length) {
        await tx.supplyReservation.deleteMany({
          where: { purchaseOrderLineId: { in: lineIdList } },
        });
        await tx.productMovementLine.deleteMany({
          where: { purchaseOrderLineId: { in: lineIdList } },
        });
        await tx.productMovement.deleteMany({
          where: { purchaseOrderLineId: { in: lineIdList } },
        });
        await tx.purchaseOrderLine.deleteMany({
          where: { id: { in: lineIdList } },
        });
      }
      await tx.purchaseOrderTag.deleteMany({
        where: { purchaseOrderId: id },
      });
      await tx.purchaseOrder.delete({ where: { id } });
    });
    return redirect("/purchase-orders");
  }

  if (intent === "po.updateInvoiceTracking") {
    if (!Number.isFinite(id)) {
      return json({ ok: false, error: "Invalid PO id" }, { status: 400 });
    }
    const next = String(form.get("invoiceTrackingStatus") || "UNKNOWN");
    await prisma.purchaseOrder.update({
      where: { id },
      data: { invoiceTrackingStatus: next },
    });
    return redirect(`/purchase-orders/${id}`);
  }

  if (intent === "po.adjustCosts") {
    if (!Number.isFinite(id)) {
      return json({ ok: false, error: "Invalid PO id" }, { status: 400 });
    }
    const raw = String(form.get("lines") || "[]");
    let payload: Array<{ id: number; manualCost: number | null }> = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) payload = parsed as any;
    } catch {
      return json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }
    const lineIds = payload
      .map((l) => Number(l?.id))
      .filter((n) => Number.isFinite(n)) as number[];
    if (!lineIds.length) {
      return json({ ok: true });
    }
    const existing = await prisma.purchaseOrderLine.findMany({
      where: { id: { in: lineIds }, purchaseOrderId: id },
      select: { id: true, manualCost: true },
    });
    const validIds = new Set(existing.map((l) => l.id));
    const updates = payload.filter((l) => validIds.has(Number(l?.id)));
    await prisma.$transaction(
      updates.map((l) => {
        const next = Number(l?.manualCost ?? 0);
        return prisma.purchaseOrderLine.update({
          where: { id: Number(l.id) },
          data: { manualCost: Number.isFinite(next) ? next : null },
        });
      })
    );
    return redirect(`/purchase-orders/${id}`);
  }

  if (intent === "reservation.update") {
    const reservationId = Number(form.get("reservationId"));
    const qtyRaw = form.get("qty");
    const noteRaw = form.get("note");
    if (!Number.isFinite(reservationId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const qty =
      qtyRaw == null || String(qtyRaw).trim() === "" ? 0 : Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0) {
      return json({ ok: false, error: "invalid_qty" }, { status: 400 });
    }
    const reservation = await prisma.supplyReservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        qtyReserved: true,
        purchaseOrderLineId: true,
        purchaseOrderLine: {
          select: {
            purchaseOrderId: true,
            quantityOrdered: true,
            quantity: true,
            qtyReceived: true,
          },
        },
      },
    });
    if (!reservation || reservation.purchaseOrderLine?.purchaseOrderId !== id) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    const qtyOrdered =
      Number(reservation.purchaseOrderLine?.quantityOrdered ?? 0) || 0;
    const qtyExpected = resolveExpectedQty(reservation.purchaseOrderLine);
    const receiptTotals = await prisma.shipmentLine.aggregate({
      where: {
        purchaseOrderLineId: reservation.purchaseOrderLineId ?? undefined,
        shipment: { type: "In" },
      },
      _sum: { quantity: true },
    });
    const qtyReceived = Number(receiptTotals._sum.quantity ?? 0) || 0;
    const otherTotals = await prisma.supplyReservation.aggregate({
      _sum: { qtyReserved: true },
      where: {
        purchaseOrderLineId: reservation.purchaseOrderLineId ?? undefined,
        NOT: { id: reservationId },
        settledAt: null,
      },
    });
    const otherReserved = Number(otherTotals._sum.qtyReserved ?? 0);
    const maxAllowed = Math.max(qtyExpected - qtyReceived - otherReserved, 0);
    if (qty > maxAllowed) {
      return json(
        { ok: false, error: "exceeds_available", available: maxAllowed },
        { status: 400 }
      );
    }
    await prisma.supplyReservation.update({
      where: { id: reservationId },
      data: {
        qtyReserved: qty,
        note:
          typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null,
      },
    });
    return json({ ok: true });
  }

  if (intent === "reservation.delete") {
    const reservationId = Number(form.get("reservationId"));
    if (!Number.isFinite(reservationId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const reservation = await prisma.supplyReservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        purchaseOrderLine: { select: { purchaseOrderId: true } },
      },
    });
    if (!reservation || reservation.purchaseOrderLine?.purchaseOrderId !== id) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    await prisma.supplyReservation.delete({ where: { id: reservationId } });
    return json({ ok: true });
  }

  if (intent === "reservations.trim") {
    const lineId = Number(form.get("lineId"));
    if (!Number.isFinite(lineId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const line = await prisma.purchaseOrderLine.findUnique({
      where: { id: lineId },
      select: {
        id: true,
        purchaseOrderId: true,
      },
    });
    if (!line || line.purchaseOrderId !== id) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    const trimmed = await trimReservationsToExpected({
      purchaseOrderLineId: lineId,
    });
    if (!trimmed) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    return json({ ok: true, trimmed: trimmed.trimmed });
  }

  if (intent === "po.update") {
    const userId = await requireUserId(request);
    const raw = String(form.get("purchaseOrder") || "{}");
    let rawObj: any = {};
    try {
      rawObj = JSON.parse(raw);
    } catch {
      rawObj = {};
    }
    const data = marshallPurchaseOrderToPrisma(rawObj);
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { status: true },
    });
    await prisma.purchaseOrder.update({ where: { id }, data });

    // Finalize: when transitioning into FINAL, lock line copies/prices/qty
    const nextStatus = String(data.status || "");
    const prevStatus = String(existing?.status || "");
    const isFinalizing = nextStatus === "FINAL" && prevStatus !== "FINAL";
    if (isFinalizing) {
      const lines = await prisma.purchaseOrderLine.findMany({
        where: { purchaseOrderId: id },
        select: {
          id: true,
          productId: true,
          quantityOrdered: true,
          manualCost: true,
          manualSell: true,
          priceCost: true,
          priceSell: true,
        },
      });
      for (const ln of lines) {
        const pid = Number(ln.productId || 0);
        if (!pid) continue;
        const prod = await prisma.product.findUnique({
          where: { id: pid },
          select: {
            sku: true,
            name: true,
            costPrice: true,
            purchaseTax: { select: { value: true } },
            manualSalePrice: true,
          },
        });
        if (!prod) continue;
        const qty = Number(ln.quantityOrdered || 0) || 1;
        let sell = 0;
        if (prod.manualSalePrice != null) {
          sell = Number(prod.manualSalePrice || 0) || 0;
        } else {
          const auto = await ProductPricingService.getAutoSellPrice(pid, qty);
          sell = Number(auto || 0) || 0;
        }
        const cost = Number(prod.costPrice ?? 0) || 0;
        const taxRate = Number(prod.purchaseTax?.value ?? 0) || 0;
        const lineData: any = {
          productSkuCopy: prod.sku ?? null,
          productNameCopy: prod.name ?? null,
          taxRate: taxRate,
          quantity: ln.quantityOrdered ?? 0,
        };
        if (ln.manualCost == null && ln.priceCost == null)
          lineData.priceCost = cost;
        if (ln.manualSell == null && ln.priceSell == null)
          lineData.priceSell = sell;
        await prisma.purchaseOrderLine.update({
          where: { id: ln.id },
          data: lineData,
        });
      }
    } else {
      const datesEqual = (a: Date | null, b: Date | null) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.getTime() === b.getTime();
      };
      // Determine the status we should apply line rules against
      const desiredStatus = nextStatus || prevStatus;

      // When in DRAFT, persist lines from the posted form: create new lines, update existing
      // and delete removed lines. Product and quantityOrdered are editable in DRAFT.
      if ((desiredStatus || "DRAFT") === "DRAFT") {
        const incomingLines: Array<any> = Array.isArray(rawObj?.lines)
          ? rawObj.lines
          : [];
        // Fetch existing lines for this PO
        const existingLines = await prisma.purchaseOrderLine.findMany({
          where: { purchaseOrderId: id },
          select: { id: true },
        });
        const existingIdSet = new Set(existingLines.map((l) => l.id));

        // Upsert incoming lines
        // Create new lines for any incoming that don't match an existing id
        const toCreate = incomingLines.filter(
          (l) => !existingIdSet.has(Number(l?.id))
        );
        if (toCreate.length) {
          const max = await prisma.purchaseOrderLine.aggregate({
            _max: { id: true },
          });
          let nextLineId = (max._max.id || 0) + 1;
          for (const l of toCreate) {
            const productId = Number(l?.productId);
            if (!Number.isFinite(productId) || productId <= 0) continue;
            const quantityOrdered = Number(l?.quantityOrdered || 0) || 0;
            const etaDate = parseDateInput(l?.etaDate);
            const etaDateConfirmed = Boolean(l?.etaDateConfirmed);
            const canConfirm = etaDateConfirmed && etaDate != null;
            await prisma.purchaseOrderLine.create({
              data: {
                id: nextLineId++,
                purchaseOrderId: id,
                productId,
                quantityOrdered,
                quantity: 0,
                etaDate,
                etaDateConfirmed: canConfirm,
                etaConfirmedAt: canConfirm ? new Date() : null,
                etaConfirmedByUserId: canConfirm ? userId : null,
              },
            });
          }
        }

        // Update existing lines' product/quantityOrdered if present in incoming
        const incomingById = new Map<number, any>();
        for (const l of incomingLines) {
          const lid = Number(l?.id);
          if (Number.isFinite(lid)) incomingById.set(lid, l);
        }
        const existingLineMeta = await prisma.purchaseOrderLine.findMany({
          where: { id: { in: Array.from(existingIdSet) } },
          select: {
            id: true,
            etaDate: true,
            etaDateConfirmed: true,
          },
        });
        const existingById = new Map(
          existingLineMeta.map((line) => [line.id, line])
        );
        for (const lid of existingIdSet) {
          const l = incomingById.get(lid);
          if (!l) continue;
          const existingLine = existingById.get(lid);
          const productId = Number(l?.productId);
          const quantityOrdered = Number(l?.quantityOrdered ?? 0) || 0;
          const patch: any = {};
          if (Number.isFinite(productId) && productId > 0)
            patch.productId = productId;
          patch.quantityOrdered = quantityOrdered;
          if ("etaDate" in l) {
            const nextEtaDate = parseDateInput(l?.etaDate);
            const prevEtaDate = existingLine?.etaDate ?? null;
            const etaChanged = !datesEqual(nextEtaDate, prevEtaDate);
            patch.etaDate = nextEtaDate;
            if (etaChanged) {
              patch.etaDateConfirmed = false;
              patch.etaConfirmedAt = null;
              patch.etaConfirmedByUserId = null;
            }
          }
          if ("etaDateConfirmed" in l) {
            const etaDate =
              patch.etaDate !== undefined
                ? patch.etaDate
                : existingLine?.etaDate ?? null;
            if (!etaDate) {
              patch.etaDateConfirmed = false;
              patch.etaConfirmedAt = null;
              patch.etaConfirmedByUserId = null;
            } else if (Boolean(l?.etaDateConfirmed)) {
              patch.etaDateConfirmed = true;
              patch.etaConfirmedAt = new Date();
              patch.etaConfirmedByUserId = userId;
            } else {
              patch.etaDateConfirmed = false;
              patch.etaConfirmedAt = null;
              patch.etaConfirmedByUserId = null;
            }
          }
          await prisma.purchaseOrderLine.update({
            where: { id: lid },
            data: patch,
          });
        }

        // Delete lines that were removed in the client when in DRAFT
        const incomingIdSet = new Set(
          incomingLines
            .map((l) => Number(l?.id))
            .filter((n) => Number.isFinite(n)) as number[]
        );
        const toDelete = Array.from(existingIdSet).filter(
          (lid) => !incomingIdSet.has(lid)
        );
        if (toDelete.length) {
          await prisma.purchaseOrderLine.deleteMany({
            where: { id: { in: toDelete } },
          });
        }
      } else if (desiredStatus && desiredStatus !== "DRAFT") {
        // Non-finalizing updates when not DRAFT: allow editing of line.actual quantity in FINAL/RECEIVING,
        // enforce constraints and lock quantities in COMPLETE/CANCELED.
        // Only process line edits when not draft
        const incomingLines: Array<any> = Array.isArray(rawObj?.lines)
          ? rawObj.lines
          : [];
        if (incomingLines.length) {
          const lineIds = incomingLines
            .map((l) => Number(l?.id))
            .filter((n) => Number.isFinite(n));
          if (lineIds.length) {
            // Fetch current received sums and existing quantities
            const existingLines = await prisma.purchaseOrderLine.findMany({
              where: { id: { in: lineIds } },
              select: {
                id: true,
                purchaseOrderId: true,
                quantity: true,
                quantityOrdered: true,
                etaDate: true,
                etaDateConfirmed: true,
              },
            });
            const receiptLines = await prisma.shipmentLine.findMany({
              where: {
                purchaseOrderLineId: { in: lineIds },
                shipment: { type: "In" },
              },
              select: { purchaseOrderLineId: true, quantity: true },
            });
            const receivedMap = new Map<number, number>();
            for (const sl of receiptLines) {
              const lid = Number(sl.purchaseOrderLineId);
              receivedMap.set(
                lid,
                (receivedMap.get(lid) || 0) + Number(sl.quantity || 0)
              );
            }
            // Apply updates respecting constraints
            for (const l of incomingLines) {
              const lid = Number(l?.id);
              if (!Number.isFinite(lid)) continue;
              const exist = existingLines.find((x) => x.id === lid);
              if (!exist || exist.purchaseOrderId !== id) continue;
              // Never allow changing quantityOrdered when not draft
              // Only update actual quantity when allowed
              const patch: any = {};
              if (
                desiredStatus === "COMPLETE" ||
                desiredStatus === "CANCELED"
              ) {
                continue; // locked
              }
              const desired = Number(l?.quantity);
              if (!Number.isFinite(desired)) continue;
              const minQty = receivedMap.get(lid) || 0;
              const finalQty = Math.max(desired, minQty);
              patch.quantity = finalQty;
              if ("etaDate" in l) {
                const nextEtaDate = parseDateInput(l?.etaDate);
                const prevEtaDate = exist.etaDate ?? null;
                const etaChanged = !datesEqual(nextEtaDate, prevEtaDate);
                patch.etaDate = nextEtaDate;
                if (etaChanged) {
                  patch.etaDateConfirmed = false;
                  patch.etaConfirmedAt = null;
                  patch.etaConfirmedByUserId = null;
                }
              }
              if ("etaDateConfirmed" in l) {
                const etaDate =
                  patch.etaDate !== undefined ? patch.etaDate : exist.etaDate;
                if (!etaDate) {
                  patch.etaDateConfirmed = false;
                  patch.etaConfirmedAt = null;
                  patch.etaConfirmedByUserId = null;
                } else if (Boolean(l?.etaDateConfirmed)) {
                  patch.etaDateConfirmed = true;
                  patch.etaConfirmedAt = new Date();
                  patch.etaConfirmedByUserId = userId;
                } else {
                  patch.etaDateConfirmed = false;
                  patch.etaConfirmedAt = null;
                  patch.etaConfirmedByUserId = null;
                }
              }
              await prisma.purchaseOrderLine.update({
                where: { id: lid },
                data: patch,
              });
            }
          }
        }
      }
      // Manual transition RECEIVING -> COMPLETE: set quantities == received
      if (prevStatus === "RECEIVING" && nextStatus === "COMPLETE") {
        const lines = await prisma.purchaseOrderLine.findMany({
          where: { purchaseOrderId: id },
          select: { id: true },
        });
        const ids = lines.map((l) => l.id);
        if (ids.length) {
          const receiptLines = await prisma.shipmentLine.findMany({
            where: {
              purchaseOrderLineId: { in: ids },
              shipment: { type: "In" },
            },
            select: { purchaseOrderLineId: true, quantity: true },
          });
          const receivedMap = new Map<number, number>();
          for (const sl of receiptLines) {
            const lid = Number(sl.purchaseOrderLineId);
            receivedMap.set(
              lid,
              (receivedMap.get(lid) || 0) + Number(sl.quantity || 0)
            );
          }
          for (const lid of ids) {
            const qty = receivedMap.get(lid) || 0;
            await prisma.purchaseOrderLine.update({
              where: { id: lid },
              data: { quantity: qty },
            });
          }
        }
      }
    }
    return redirect(`/purchase-orders/${id}`);
  }
  if (intent === "line.add") {
    if (!Number.isFinite(id)) return redirect(`/purchase-orders/${params.id}`);
    const productId = Number(form.get("productId"));
    const qtyOrdered = Number(form.get("quantityOrdered"));
    if (Number.isFinite(productId) && Number.isFinite(qtyOrdered)) {
      const max = await prisma.purchaseOrderLine.aggregate({
        _max: { id: true },
      });
      const nextId = (max._max.id || 0) + 1;
      await prisma.purchaseOrderLine.create({
        data: {
          id: nextId,
          purchaseOrderId: id,
          productId,
          quantityOrdered: qtyOrdered,
          quantity: 0,
          etaDate: null,
          etaDateConfirmed: false,
        },
      });
    }
    return redirect(`/purchase-orders/${id}`);
  }
  if (intent === "po.receive") {
    // Reuse the already-read form data; do not read request.formData() again
    const f = form;
    const poId = Number(f.get("poId"));
    if (!Number.isFinite(poId))
      return json({ error: "Invalid PO id" }, { status: 400 });
    const dateStr = String(f.get("date") || "");
    const date = dateStr ? new Date(dateStr) : new Date();
    // Derive PO location from DB to enforce it server-side
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: {
        id: true,
        locationId: true,
        companyId: true,
        consigneeCompanyId: true,
      },
    });
    if (!po) return json({ error: "PO not found" }, { status: 404 });
    const enforcedLocationId = po.locationId ?? null;

    let payload: Array<{
      lineId: number;
      productId: number;
      total?: number; // ignored, we recompute from batches
      batches: Array<{
        name?: string | null;
        codeMill?: string | null;
        codeSartor?: string | null;
        qty: number;
      }>;
    }> = [];
    try {
      const s = String(f.get("payload") || "[]");
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) payload = parsed;
    } catch {}

    try {
      // Execute the receive as a transaction
      await prisma.$transaction(async (tx) => {
        // Create a Shipment header for this receive (one per request)
        const maxShip = await tx.shipment.aggregate({ _max: { id: true } });
        const shipmentId = (maxShip._max.id || 0) + 1;
        const shipment = await tx.shipment.create({
          data: {
            id: shipmentId,
            date,
            type: "In",
            shipmentType: "PO Receive",
            status: "COMPLETE",
            locationId: po.locationId ?? undefined,
            memo: `Auto-created for PO ${poId} receive`,
          } as any,
        });

        // Map: productId -> shipping line id (reuse for multiple rows of same product)
        const shippingLineIds = new Map<number, number>();

        const payloadLineIds = Array.from(
          new Set(
            payload
              .map((row) => Number(row?.lineId))
              .filter((lineId) => Number.isFinite(lineId) && lineId > 0)
          )
        );
        const receivedTotals = new Map<number, number>();
        if (payloadLineIds.length) {
          const receiptLines = await tx.shipmentLine.findMany({
            where: {
              purchaseOrderLineId: { in: payloadLineIds },
              shipment: { type: "In" },
            },
            select: { purchaseOrderLineId: true, quantity: true },
          });
          for (const sl of receiptLines) {
            const lid = Number(sl.purchaseOrderLineId);
            if (!Number.isFinite(lid)) continue;
            receivedTotals.set(
              lid,
              (receivedTotals.get(lid) || 0) + Number(sl.quantity || 0)
            );
          }
        }
        const lineQuantityMap = new Map<number, number>();
        const touchedLineIds = new Set<number>();
        const lineRows = payloadLineIds.length
          ? await tx.purchaseOrderLine.findMany({
              where: { id: { in: payloadLineIds } },
              select: {
                id: true,
                purchaseOrderId: true,
                productId: true,
                quantityOrdered: true,
                quantity: true,
                qtyReceived: true,
                product: {
                  select: {
                    stockTrackingEnabled: true,
                    batchTrackingEnabled: true,
                  },
                },
              },
            })
          : [];
        const lineById = new Map<number, (typeof lineRows)[number]>();
        for (const line of lineRows) {
          lineById.set(line.id, line);
          lineQuantityMap.set(line.id, Number(line.quantity || 0) || 0);
        }
        const currentReceivedByLine = new Map<number, number>();
        for (const line of lineRows) {
          currentReceivedByLine.set(line.id, receivedTotals.get(line.id) || 0);
        }

        for (const row of payload) {
          // Validate line belongs to PO and product matches
          const line = lineById.get(row.lineId);
          if (!line || line.purchaseOrderId !== poId)
            throw new Error("PO_RECEIVE: Invalid PO line");
          if (Number(line.productId) !== Number(row.productId))
            throw new Error("PO_RECEIVE: Product mismatch for PO line");

          const stockTrackingEnabled =
            line.product?.stockTrackingEnabled !== false;
          const batchTrackingEnabled =
            line.product?.batchTrackingEnabled === true;
          const requiresBatches = stockTrackingEnabled && batchTrackingEnabled;

          const batches = Array.isArray(row.batches) ? row.batches : [];
          const batchSum = batches.reduce(
            (t, b) => t + (Number(b.qty) || 0),
            0
          );
          const total = Number(row.total || 0);
          const sum = requiresBatches ? batchSum : total;
          if (sum <= 0) continue; // nothing to do for this row

          const qtyOrdered = Number(line.quantityOrdered || 0);
          const alreadyReceived = currentReceivedByLine.get(line.id) || 0;
          const remaining = Math.max(0, qtyOrdered - alreadyReceived);
          // Allow over-receive: do not block if sum > remaining; we accept and record movement as-is.

          const nextTotalReceived = alreadyReceived + sum;
          currentReceivedByLine.set(line.id, nextTotalReceived);
          touchedLineIds.add(line.id);

          // Ensure shipment line for product (reuse if multiple movement rows share product)
          let shipLineId = shippingLineIds.get(row.productId);
          if (!shipLineId) {
            const maxSL = await tx.shipmentLine.aggregate({
              _max: { id: true },
            });
            shipLineId = (maxSL._max.id || 0) + 1;
            const sl = await tx.shipmentLine.create({
              data: {
                id: shipLineId,
                shipmentId: shipment.id,
                productId: row.productId,
                purchaseOrderLineId: row.lineId,
                quantity: sum,
                locationId: po.locationId ?? undefined,
                details: `PO ${poId} receive`,
                status: "RECEIVED",
              } as any,
            });
            shippingLineIds.set(row.productId, sl.id);
          } else {
            // Increment existing shipment line quantity
            await tx.shipmentLine.update({
              where: { id: shipLineId },
              data: { quantity: { increment: sum } as any },
            });
          }

          if (!stockTrackingEnabled) {
            // Stock tracking off: skip movements/batches
            continue;
          }

          // Create product movement header per row (link to shippingLineId)
          const hdr = await tx.productMovement.create({
            data: {
              movementType: "PO (Receive)",
              date,
              productId: row.productId,
              purchaseOrderLineId: row.lineId,
              locationInId: enforcedLocationId ?? undefined,
              quantity: Math.abs(sum),
              notes: `PO ${poId} receive`,
              shippingLineId: shipLineId,
            },
          });

          if (requiresBatches) {
            for (const b of batches) {
              const qty = Math.abs(Number(b.qty) || 0);
              if (qty <= 0) continue;
              const created = await tx.batch.create({
                data: {
                  productId: row.productId,
                  name: b.name || null,
                  codeMill: b.codeMill || null,
                  codeSartor: b.codeSartor || null,
                  locationId: enforcedLocationId ?? undefined,
                  receivedAt: date,
                  source: String(poId),
                  quantity: qty, // seed fallback
                },
              });
              await tx.productMovementLine.create({
                data: {
                  movementId: hdr.id,
                  productMovementId: hdr.id,
                  productId: row.productId,
                  batchId: created.id,
                  quantity: qty,
                  notes: null,
                  purchaseOrderLineId: row.lineId,
                },
              });
            }
          } else {
            await tx.productMovementLine.create({
              data: {
                movementId: hdr.id,
                productMovementId: hdr.id,
                productId: row.productId,
                batchId: null,
                quantity: Math.abs(sum),
                notes: null,
                purchaseOrderLineId: row.lineId,
              },
            });
          }

          // Do not update line fields; received quantities are derived from shipments
        }

        if (touchedLineIds.size) {
          for (const lid of touchedLineIds) {
            const totalReceived = currentReceivedByLine.get(lid) || 0;
            const currentQty = lineQuantityMap.get(lid) ?? 0;
            if (totalReceived > currentQty) {
              await tx.purchaseOrderLine.update({
                where: { id: lid },
                data: { quantity: totalReceived },
              });
            }
          }
        }
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.startsWith("PO_RECEIVE:")) {
        return json(
          { error: msg.replace(/^PO_RECEIVE:\s*/, "") },
          { status: 400 }
        );
      }
      throw e; // unexpected
    }

    try {
      await refreshProductStockSnapshot(false);
    } catch (e) {
      console.warn("MV refresh failed (po.receive)", e);
    }
    // Auto-advance PO status based on received quantities
    try {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        select: {
          id: true,
          status: true,
          lines: {
            select: { id: true, quantity: true, quantityOrdered: true },
          },
        },
      });
      if (po) {
        const ids = po.lines.map((l) => l.id);
        let anyReceived = false;
        let allFilled = false;
        if (ids.length) {
          const receiptLines = await prisma.shipmentLine.findMany({
            where: {
              purchaseOrderLineId: { in: ids },
              shipment: { type: "In" },
            },
            select: { purchaseOrderLineId: true, quantity: true },
          });
          const receivedMap = new Map<number, number>();
          for (const sl of receiptLines) {
            const lid = Number(sl.purchaseOrderLineId);
            receivedMap.set(
              lid,
              (receivedMap.get(lid) || 0) + Number(sl.quantity || 0)
            );
          }
          anyReceived = Array.from(receivedMap.values()).some(
            (v) => (v || 0) > 0
          );
          allFilled = po.lines.every((l) => {
            const rec = receivedMap.get(l.id) || 0;
            const target =
              Number(l.quantity || 0) > 0
                ? Number(l.quantity || 0)
                : Number(l.quantityOrdered || 0);
            return rec >= target && target >= 0;
          });
        }
        let next = po.status;
        if (po.status === "FINAL" && anyReceived) next = "RECEIVING" as any;
        if (allFilled) next = "COMPLETE" as any;
        if (next !== po.status) {
          await prisma.purchaseOrder.update({
            where: { id: poId },
            data: { status: next },
          });
        }
      }
    } catch (e) {
      console.warn("Failed to auto-advance PO status after receive", e);
    }
    return redirect(`/purchase-orders/${poId}`);
  }
  if (intent === "po.receive.delete") {
    const poId = Number(form.get("poId"));
    const shipmentLineId = Number(form.get("shipmentLineId"));
    if (!Number.isFinite(poId) || !Number.isFinite(shipmentLineId)) {
      return json({ error: "Invalid ids" }, { status: 400 });
    }
    const shipmentLine = await prisma.shipmentLine.findUnique({
      where: { id: shipmentLineId },
      select: {
        id: true,
        shipmentId: true,
        purchaseOrderLineId: true,
        shipment: { select: { id: true, type: true } },
      },
    });
    if (!shipmentLine || shipmentLine.shipment?.type !== "In") {
      return json({ error: "Receipt line not found" }, { status: 404 });
    }
    if (!shipmentLine.purchaseOrderLineId) {
      return json(
        { error: "Receipt line is not linked to a PO line" },
        { status: 400 }
      );
    }
    const poLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: shipmentLine.purchaseOrderLineId },
      select: { id: true, purchaseOrderId: true },
    });
    if (!poLine || poLine.purchaseOrderId !== poId) {
      return json(
        { error: "Receipt does not belong to this PO" },
        { status: 400 }
      );
    }
    try {
      await prisma.$transaction(async (tx) => {
        const movements = await tx.productMovement.findMany({
          where: { shippingLineId: shipmentLineId },
          select: {
            id: true,
            movementType: true,
            shippingLineId: true,
            lines: { select: { id: true, batchId: true } },
          },
        });
        const movementIds = movements.map((m) => m.id);
        for (const mv of movements) {
          if ((mv.movementType || "").toLowerCase() !== "po (receive)") {
            throw new Error(
              "PO_RECEIVE_DELETE: Receipt line has non-PO movement entries"
            );
          }
        }
        const batchIds = movements
          .flatMap((m) => (m.lines || []).map((l) => Number(l.batchId)))
          .filter((n) => Number.isFinite(n)) as number[];
        if (batchIds.length) {
          // Server-side safety: ensure these batches have not been moved after creation
          const links = await tx.productMovementLine.findMany({
            where: { batchId: { in: batchIds } },
            select: { batchId: true, movementId: true },
          });
          const byBatch = new Map<number, Set<number>>();
          for (const l of links) {
            const bid = Number(l.batchId);
            if (!Number.isFinite(bid)) continue;
            if (!byBatch.has(bid)) byBatch.set(bid, new Set<number>());
            byBatch.get(bid)!.add(Number(l.movementId));
          }
          for (const bid of batchIds) {
            const s = byBatch.get(bid) || new Set();
            const onlyMovements = movementIds.length
              ? Array.from(s).every((id) => movementIds.includes(id))
              : false;
            if (!onlyMovements) {
              throw new Error(
                "PO_RECEIVE_DELETE: Batch has other movements and cannot be deleted"
              );
            }
          }
        }
        if (movementIds.length) {
          await tx.productMovementLine.deleteMany({
            where: {
              OR: [
                { movementId: { in: movementIds } },
                { productMovementId: { in: movementIds } },
              ],
            },
          });
          await tx.productMovement.deleteMany({
            where: { id: { in: movementIds } },
          });
        }
        if (batchIds.length) {
          await tx.batch.deleteMany({ where: { id: { in: batchIds } } });
        }
        await tx.shipmentLine.delete({ where: { id: shipmentLineId } });
        if (shipmentLine.shipmentId) {
          const remaining = await tx.shipmentLine.count({
            where: { shipmentId: shipmentLine.shipmentId },
          });
          if (remaining === 0) {
            await tx.shipment.delete({
              where: { id: shipmentLine.shipmentId },
            });
          }
        }
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.startsWith("PO_RECEIVE_DELETE:")) {
        return json(
          { error: msg.replace(/^PO_RECEIVE_DELETE:\s*/, "") },
          { status: 400 }
        );
      }
      throw e;
    }

    try {
      await refreshProductStockSnapshot(false);
    } catch (e) {
      console.warn("MV refresh failed (po.receive.delete)", e);
    }
    // Recompute PO status after deletion
    try {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        select: {
          id: true,
          status: true,
          lines: {
            select: { id: true, quantity: true, quantityOrdered: true },
          },
        },
      });
      if (po) {
        const ids = po.lines.map((l) => l.id);
        let anyReceived = false;
        let allFilled = false;
        if (ids.length) {
          const receiptLines = await prisma.shipmentLine.findMany({
            where: {
              purchaseOrderLineId: { in: ids },
              shipment: { type: "In" },
            },
            select: { purchaseOrderLineId: true, quantity: true },
          });
          const receivedMap = new Map<number, number>();
          for (const sl of receiptLines) {
            const lid = Number(sl.purchaseOrderLineId);
            receivedMap.set(
              lid,
              (receivedMap.get(lid) || 0) + Number(sl.quantity || 0)
            );
          }
          anyReceived = Array.from(receivedMap.values()).some(
            (v) => (v || 0) > 0
          );
          allFilled = po.lines.every((l) => {
            const rec = receivedMap.get(l.id) || 0;
            const target =
              Number(l.quantity || 0) > 0
                ? Number(l.quantity || 0)
                : Number(l.quantityOrdered || 0);
            return rec >= target && target >= 0;
          });
        }
        let next = po.status;
        if (next === "RECEIVING" && !anyReceived) next = "FINAL" as any;
        if (next === "COMPLETE" && !allFilled) next = "RECEIVING" as any;
        if (next !== po.status) {
          await prisma.purchaseOrder.update({
            where: { id: poId },
            data: { status: next },
          });
        }
      }
    } catch (e) {
      console.warn("Failed to adjust PO status after receive delete", e);
    }

    return redirect(`/purchase-orders/${poId}`);
  }
  return redirect(`/purchase-orders/${id}`);
}

export function PurchaseOrderDetailView() {
  const {
    purchaseOrder,
    totals,
    productOptions,
    poMovements,
    receiptShipments,
    receiptLineMeta,
    supplierInvoices,
    invoiceSummary,
    accountingSummary,
  } = useRouteLoaderData<typeof loader>(
    "modules/purchaseOrder/routes/purchase-orders.$id"
  )!;
  const { productMovementCount } = useRouteLoaderData<typeof loader>(
    "modules/purchaseOrder/routes/purchase-orders.$id"
  )!;
  const actionData = useActionData<typeof action>() as any;
  const { setCurrentId } = useRecordContext();
  const submit = useSubmit();
  const deleteFetcher = useFetcher<{ error?: string }>();
  const reservationFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  // console.log("PO detail", purchaseOrder, totals);

  // Register current id in RecordContext
  useEffect(() => {
    setCurrentId(purchaseOrder.id, "restore");
  }, [purchaseOrder.id, setCurrentId]);
  const [reservationLine, setReservationLine] = useState<any | null>(null);
  useEffect(() => {
    if (
      reservationFetcher.state === "idle" &&
      reservationFetcher.data &&
      reservationFetcher.data.ok
    ) {
      revalidator.revalidate();
      setReservationLine(null);
    }
  }, [reservationFetcher.state, reservationFetcher.data, revalidator]);

  const form = useForm({ defaultValues: purchaseOrder });
  const { isDirty } = form.formState;
  console.log("PO form", form.getValues());
  console.log(
    "PO defaults",
    form.formState.dirtyFields,
    form.formState.defaultValues
  );
  const variantBreakdownGroups = useMemo(
    () =>
      groupVariantBreakdowns(purchaseOrder.lines || [], {
        getBreakdown: (line: any) => {
          if (Array.isArray(line.qtyBreakdown) && line.qtyBreakdown.length) {
            return line.qtyBreakdown;
          }
          if (
            Array.isArray(line.assembly?.qtyOrderedBreakdown) &&
            line.assembly.qtyOrderedBreakdown.length
          ) {
            return line.assembly.qtyOrderedBreakdown;
          }
          return [];
        },
        getVariant: (line: any) => resolveVariantSourceFromLine(line),
        getItemKey: (line: any) => line.id,
      }),
    [purchaseOrder.lines]
  );

  // Product cache: id -> enriched product (tiers, tax, manualSalePrice)
  const [productMap, setProductMap] = useState<Record<number, any>>({});
  const [pricingPrefs, setPricingPrefs] = useState<{
    marginOverride?: number | null;
    vendorDefaultMargin?: number | null;
    globalDefaultMargin?: number | null;
    priceMultiplier?: number | null;
  } | null>(null);
  const ensureProducts = async (ids: number[]) => {
    const missing = ids.filter((id) => productMap[id] == null);
    if (!missing.length) return;
    try {
      const resp = await fetch(`/api/products/by-ids?ids=${missing.join(",")}`);
      const data = await resp.json();
      const map: Record<number, any> = {};
      for (const it of data?.items || []) map[Number(it.id)] = it;
      setProductMap((prev) => ({ ...prev, ...map }));
    } catch (e) {
      console.warn("Failed to fetch products", e);
    }
  };

  // Prefetch enriched product details for existing lines (tiers, tax, manualSellPrice)
  useEffect(() => {
    const ids = Array.from(
      new Set(
        (purchaseOrder.lines || [])
          .map((l: any) => Number(l.productId))
          .filter((n) => Number.isFinite(n))
      )
    );
    if (!ids.length) return;
    ensureProducts(ids);
  }, [purchaseOrder.id]);

  // Fetch customer/vendor pricing prefs (margin overrides) for sell-price calculations
  useEffect(() => {
    const vendorId = purchaseOrder.companyId;
    const customerId = purchaseOrder.consigneeCompanyId;
    if (!vendorId || !customerId) {
      setPricingPrefs(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `/api/customers/${customerId}/pricing?vendorId=${vendorId}`
        );
        const js = await resp.json();
        if (!cancelled) {
          setPricingPrefs({
            marginOverride: js.marginOverride ?? null,
            vendorDefaultMargin: js.vendorDefaultMargin ?? null,
            globalDefaultMargin: js.globalDefaultMargin ?? null,
            priceMultiplier: js.priceMultiplier ?? null,
          });
        }
      } catch (e) {
        console.warn("Failed to fetch pricing prefs", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [purchaseOrder.companyId, purchaseOrder.consigneeCompanyId]);

  // When consignee changes, auto-set locationId to customer's default stockLocationId or fallback to 1
  // Auto-set location when consignee changes: fetch company row to get default stockLocationId; fallback to 1.
  // Fix missing refs after introducing nav hooks: use form.watch
  const consigneeCompanyId = form.watch("consigneeCompanyId");
  useEffect(() => {
    if (!consigneeCompanyId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/companies/rows?ids=${consigneeCompanyId}`);
        if (!r.ok) return;
        const data = await r.json();
        const row = data.rows?.[0];
        const targetLocationId = row?.stockLocationId || 1;
        // Only update if different to avoid unnecessary dirty state churn
        const currentLoc = form.getValues("locationId" as any);
        if (!cancelled && currentLoc !== targetLocationId) {
          form.setValue("locationId" as any, targetLocationId, {
            shouldDirty: true,
          });
        }
      } catch (e) {
        const currentLoc = form.getValues("locationId" as any);
        if (!cancelled && currentLoc !== 1) {
          form.setValue("locationId" as any, 1, { shouldDirty: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [consigneeCompanyId, form]);
  const savePurchaseOrder = (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "po.update");
    fd.set("purchaseOrder", JSON.stringify(values));
    submit(fd, { method: "post" });
  };

  // Wire Save/Discard with Global Form Context: Save posts form values; Discard resets to loader state
  useInitGlobalFormContext(form as any, savePurchaseOrder, () => {
    // Discard resets back to last loaded data
    form.reset(purchaseOrder as any);
  });

  // After a successful save (loader re-runs), reset the form to clear dirty state
  useEffect(() => {
    form.reset(purchaseOrder as any);
  }, [purchaseOrder, form]);

  // Surface delete errors via notification
  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.error) {
      notifications.show({
        title: "Delete blocked",
        message: deleteFetcher.data.error,
        color: "red",
      });
    }
  }, [deleteFetcher.state, deleteFetcher.data]);

  // Local state for adding a line
  const [addOpen, setAddOpen] = useState(false);
  const [newProductId, setNewProductId] = useState<number | null>(null);
  const [newQtyOrdered, setNewQtyOrdered] = useState<number>(0);
  const [productPickerKey, setProductPickerKey] = useState<number>(0);
  const [productSearchFocusKey, setProductSearchFocusKey] = useState<number>(0);

  useEffect(() => {
    if (addOpen) {
      setProductSearchFocusKey((k) => k + 1);
    }
  }, [addOpen]);

  // Client-side add: mutate form state; saving still handled by global form context
  const doAddLine = async (keepOpen: boolean = false) => {
    if (isDirty) return;
    if (newProductId == null) return;
    // Fetch enriched product to initialize pricing and flags
    console.log("Fetching product details for", newProductId);
    const resp = await fetch(`/api/products/by-ids?ids=${newProductId}`);
    const data = await resp.json();
    console.log("Fetched product details:", data);
    const prod = data?.items?.[0];
    if (prod?.id)
      setProductMap((prev) => ({ ...prev, [Number(prod.id)]: prod }));
    const nextId =
      Math.max(
        0,
        ...(purchaseOrder.lines || []).map((l: any) => Number(l.id) || 0)
      ) + 1;
    const newLine: any = {
      id: nextId,
      productId: newProductId,
      product: {
        sku: prod?.sku ?? null,
        name: prod?.name ?? null,
        purchaseTax: prod?.purchaseTax ?? null,
      },
      quantityOrdered: 0,
      quantity: 0,
      // Seed pricing: prefer manualSalePrice; else compute on server already provided as c_sellPrice
      priceCost: prod?.costPrice ?? 0,
      priceSell: prod?.manualSalePrice ?? prod?.c_sellPrice ?? 0,
      manualCost: null,
      manualSell: null,
      etaDate: null,
      etaDateConfirmed: false,
    };
    const currLines = form.getValues("lines") || [];
    form.setValue("lines" as any, [...currLines, newLine], {
      shouldDirty: true,
      shouldValidate: false,
    });
    if (keepOpen) {
      // Reset selection and refocus product field
      setNewProductId(null);
      setNewQtyOrdered(0);
      setProductPickerKey((k) => k + 1);
    } else {
      setAddOpen(false);
    }
  };

  const maybeFinalizeFirst = async (): Promise<boolean> => {
    if (statusValue !== "DRAFT") return false;
    return new Promise<boolean>((resolve) => {
      modals.openConfirmModal({
        title: "Finalize Purchase Order?",
        children: (
          <Text size="sm">
            This purchase order is currently in <strong>Draft</strong>.
            Finalizing will lock in product lines and pricing before sending or
            printing. Do you want to finalize now?
          </Text>
        ),
        labels: { confirm: "Finalize", cancel: "Keep Draft" },
        confirmProps: { color: "blue" },
        onCancel: () => resolve(false),
        onConfirm: () => {
          form.setValue("status" as any, "FINAL", { shouldDirty: true });
          const fd = new FormData();
          fd.set("_intent", "po.update");
          fd.set("purchaseOrder", JSON.stringify(form.getValues()));
          submit(fd, { method: "post" });
          resolve(true);
        },
      });
    });
  };

  const openPrint = async () => {
    const finalized = await maybeFinalizeFirst();
    if (finalized) return; // navigation occurred; user can re-click after finalize
    window.open(`/purchase-orders/${purchaseOrder.id}/print`, "_blank");
  };
  const downloadPdf = async () => {
    const finalized = await maybeFinalizeFirst();
    if (finalized) return;
    window.open(`/purchase-orders/${purchaseOrder.id}/pdf`, "_blank");
  };

  const emailDraft = async () => {
    const finalized = await maybeFinalizeFirst();
    if (finalized) return;
    const resp = await fetch(`/purchase-orders/${purchaseOrder.id}/pdf`);
    const arr = new Uint8Array(await resp.arrayBuffer());
    let binary = "";
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    const b64 = btoa(binary);
    const boundary = "----=_NextPart_" + Math.random().toString(36).slice(2);
    const subject = `Purchase Order ${purchaseOrder.id}`;
    const bodyText = `Dear Vendor,\n\nPlease find attached Purchase Order ${purchaseOrder.id}.\n\nBest regards,\n`;
    const filename = `PO-${purchaseOrder.id}.pdf`;
    const eml = `From: \nTo: \nSubject: ${subject}\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="${boundary}"\n\n--${boundary}\nContent-Type: text/plain; charset="UTF-8"\nContent-Transfer-Encoding: 7bit\n\n${bodyText}\n\n--${boundary}\nContent-Type: application/pdf; name="${filename}"\nContent-Transfer-Encoding: base64\nContent-Disposition: attachment; filename="${filename}"\n\n${b64}\n--${boundary}--`;
    const blob = new Blob([eml], { type: "message/rfc822" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PO-${purchaseOrder.id}.eml`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const [receiveOpen, setReceiveOpen] = useState(false);
  // Watch status and lines for live draft rendering
  const statusValue =
    useWatch({ control: form.control, name: "status" }) ||
    purchaseOrder.status ||
    "DRAFT";
  const isDraft = statusValue === "DRAFT";
  const lineCount = (purchaseOrder.lines || []).length;
  const hasMovements = Number(productMovementCount || 0) > 0;
  const canDelete = !hasMovements;
  const canReceive = !isDraft && lineCount > 0;
  const fieldCtx = { isLoudMode: isDraft, accountingSummary };
  const [activeTab, setActiveTab] = useState<string>("receipts");
  const [linesViewMode, setLinesViewMode] = useState<"status" | "extended">(
    "status"
  );
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustCosts, setAdjustCosts] = useState<Record<number, number | null>>(
    {}
  );
  const receiptLineMetaById =
    (receiptLineMeta as Record<
      number,
      {
        batches?: Array<{
          id: number;
          codeMill?: string | null;
          codeSartor?: string | null;
          name?: string | null;
          quantity?: number | null;
        }>;
        movementCount?: number;
      }
    >) || {};
  const linesWatch: any[] =
    useWatch({ control: form.control, name: "lines" }) ||
    form.getValues("lines") ||
    [];

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletePhrase = "THIS IS BONKERS";
  const formatReceiptDate = (value: any) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleDateString();
  };
  const formatBatchLabel = (batch: {
    codeMill?: string | null;
    codeSartor?: string | null;
    name?: string | null;
    quantity?: number | null;
  }) => {
    const label = [batch.codeSartor, batch.codeMill, batch.name]
      .filter(Boolean)
      .join(" · ");
    const qty = Number(batch.quantity || 0) || 0;
    return label ? `${label} (${qty})` : qty ? String(qty) : "Batch";
  };
  const receiptLines = useMemo(() => {
    return (receiptShipments || []).flatMap((receipt: any) =>
      (receipt.lines || []).map((line: any) => ({
        ...line,
        shipmentId: receipt.id,
        shipmentDate: receipt.date,
        shipmentMemo: receipt.memo,
      }))
    );
  }, [receiptShipments]);
  const linePricingDebug = useMemo(() => {
    return (linesWatch || []).map((line: any) => {
      const pid = Number(line?.productId || line?.product?.id || 0);
      const prod = productMap[pid] || line?.product || null;
      const computed = computeLinePricing({
        product: prod,
        qtyOrdered: line?.quantityOrdered,
        pricingPrefs,
      });
      const manualCost =
        line?.manualCost != null ? Number(line.manualCost) : null;
      const manualSell =
        line?.manualSell != null ? Number(line.manualSell) : null;
      const storedCost =
        line?.priceCost != null ? Number(line.priceCost) : null;
      const storedSell =
        line?.priceSell != null ? Number(line.priceSell) : null;
      const effectiveCost =
        manualCost != null
          ? manualCost
          : storedCost != null
          ? storedCost
          : computed.cost;
      const effectiveSell =
        manualSell != null
          ? manualSell
          : storedSell != null
          ? storedSell
          : computed.sell;
      return {
        lineId: line?.id ?? null,
        manualCost,
        manualSell,
        computedCost: computed.cost,
        computedSell: computed.sell,
        effectiveCost,
        effectiveSell,
        priceSourceCost: manualCost != null ? "manual" : "computed",
        priceSourceSell: manualSell != null ? "manual" : "computed",
        lastRepricedAt: line?.lastRepricedAt ?? null,
        repricedBy: line?.repricedBy ?? null,
      };
    });
  }, [linesWatch, productMap, pricingPrefs, isDraft]);
  const expectedIncTax = Number(invoiceSummary?.expectedIncTax ?? 0) || 0;
  const invoicedIncTax = Number(invoiceSummary?.invoicedIncTax ?? 0) || 0;
  const deltaIncTax = Number(invoiceSummary?.deltaIncTax ?? 0) || 0;
  const invoiceTrackingStatus = String(
    purchaseOrder?.invoiceTrackingStatus || "UNKNOWN"
  );
  const invoiceCount = (supplierInvoices || []).length;
  const receiptShipmentLineCount = receiptLines.length;
  const hasReceipts = receiptShipmentLineCount > 0;
  const poWarnings = useMemo(
    () =>
      buildPurchaseOrderWarnings({
        invoiceCount,
        hasReceipts,
        receiptShipmentLineCount,
        deltaRounded: invoiceSummary?.deltaIncTax ?? 0,
        expectedRounded: invoiceSummary?.expectedIncTax ?? 0,
        invoicedRounded: invoiceSummary?.invoicedIncTax ?? 0,
        invoiceTrackingStatus,
      }),
    [
      invoiceCount,
      hasReceipts,
      receiptShipmentLineCount,
      invoiceSummary?.deltaIncTax,
      invoiceSummary?.expectedIncTax,
      invoiceSummary?.invoicedIncTax,
      invoiceTrackingStatus,
    ]
  );
  const receiptMissingWarning = poWarnings.find(
    (w) => w.code === "receipt_missing"
  );
  const invoiceMismatchWarning = poWarnings.find(
    (w) => w.code === "invoice_mismatch"
  );
  const recordInvoiceWarning = poWarnings.find(
    (w) => w.code === "record_invoice"
  );
  const hasInvoiceMismatch = Boolean(invoiceMismatchWarning);
  const calcExpected = (costs: Record<number, number | null> = adjustCosts) => {
    return (purchaseOrder.lines || []).reduce((sum: number, line: any) => {
      const qtyReceived = Number(line.qtyReceived ?? 0) || 0;
      const computed = computeLinePricing({
        product: productMap[Number(line?.productId || 0)] || line?.product,
        qtyOrdered: line?.quantityOrdered,
        pricingPrefs,
      });
      const unitCostRaw =
        costs[line.id] != null
          ? costs[line.id]
          : line.manualCost ?? line.priceCost ?? computed.cost;
      const unitCost = Number(unitCostRaw ?? 0) || 0;
      return sum + qtyReceived * unitCost;
    }, 0);
  };
  const openAdjustCosts = () => {
    const next: Record<number, number | null> = {};
    (purchaseOrder.lines || []).forEach((line: any) => {
      const cost = line.manualCost ?? line.priceCost;
      next[line.id] =
        cost == null || !Number.isFinite(Number(cost)) ? null : Number(cost);
    });
    setAdjustCosts(next);
    setAdjustOpen(true);
  };
  const adjustedExpectedExTax = calcExpected();
  const effectiveTaxRate = Number(invoiceSummary?.effectiveTaxRate ?? 0) || 0;
  const adjustedExpectedIncTax = adjustedExpectedExTax * (1 + effectiveTaxRate);
  const adjustedDeltaIncTax = invoicedIncTax - adjustedExpectedIncTax;
  const hasAdjustChanges = (purchaseOrder.lines || []).some((line: any) => {
    const current = Number(line.manualCost ?? line.priceCost ?? 0) || 0;
    const next =
      adjustCosts[line.id] == null ? current : Number(adjustCosts[line.id]);
    return Number.isFinite(next) && next !== current;
  });
  const submitAdjustCosts = () => {
    const payload = (purchaseOrder.lines || [])
      .map((line: any) => {
        const next = adjustCosts[line.id];
        if (next == null) return null;
        const nextNum = Number(next);
        if (!Number.isFinite(nextNum)) return null;
        const current = Number(line.manualCost ?? line.priceCost ?? 0) || 0;
        if (nextNum === current) return null;
        return { id: line.id, manualCost: nextNum };
      })
      .filter(Boolean);
    if (!payload.length) {
      setAdjustOpen(false);
      return;
    }
    const fd = new FormData();
    fd.set("_intent", "po.adjustCosts");
    fd.set("lines", JSON.stringify(payload));
    submit(fd, { method: "post" });
  };
  const updateInvoiceTracking = (next: string) => {
    const fd = new FormData();
    fd.set("_intent", "po.updateInvoiceTracking");
    fd.set("invoiceTrackingStatus", next);
    submit(fd, { method: "post" });
  };

  useEffect(() => {
    if (!actionData || actionData.intent !== "po.delete" || !actionData.error) {
      return;
    }
    setDeleteError(String(actionData.error));
    notifications.show({
      color: "red",
      title: "Delete blocked",
      message: String(actionData.error),
    });
  }, [actionData]);

  const handleStatusChange = (next: string) => {
    form.setValue("status" as any, next, { shouldDirty: true });
    const fd = new FormData();
    fd.set("_intent", "po.update");
    fd.set("purchaseOrder", JSON.stringify(form.getValues()));
    submit(fd, { method: "post" });
  };

  const [debugOpen, setDebugOpen] = useState(false);
  const debugData = buildFormStateDebugData({
    formId: `po-${purchaseOrder.id}`,
    formState: form.formState,
    values: form.getValues(),
    builderDefaults: purchaseOrder,
    rhfDefaults: form.control?._defaultValues ?? null,
    rhfValues: form.control?._formValues ?? null,
    control: form.control,
  });
  const debugText = buildFormStateDebugText(debugData, true, {
    dirtySources: {
      rhf: {
        isDirty: form.formState.isDirty,
        dirtyFieldsCount: Object.keys(form.formState.dirtyFields || {}).length,
        touchedFieldsCount: Object.keys(form.formState.touchedFields || {})
          .length,
        submitCount: form.formState.submitCount,
        formInstanceId: null,
      },
    },
    formInstances: {},
    assertions: {},
  });

  // getLivePrices is obsolete; pricing moved into PurchaseOrderLinesTable via useMemo

  // Prev/Next hotkeys now handled globally in RecordProvider

  const debugPayload = {
    purchaseOrder,
    totals,
    poMovements,
    receiptShipments,
    receiptLineMeta,
    supplierInvoices,
    invoiceSummary,
    linePricingDebug,
    productMovementCount,
    actionData,
    fetchers: {
      deleteFetcher: {
        state: deleteFetcher.state,
        data: deleteFetcher.data,
      },
      reservationFetcher: {
        state: reservationFetcher.state,
        data: reservationFetcher.data,
      },
    },
    guards: {
      isDraft,
      hasMovements,
      canDelete,
      canReceive,
      lineCount,
    },
  } as any;

  return (
    <Stack>
      <Group justify="space-between" align="center">
        {(() => {
          const saved = getSavedIndexSearch("/purchase-orders");
          const hrefPO = saved
            ? `/purchase-orders${saved}`
            : "/purchase-orders";
          return (
            <BreadcrumbSet
              breadcrumbs={[
                { label: "POs", href: hrefPO },
                {
                  label: String(purchaseOrder.id),
                  href: `/purchase-orders/${purchaseOrder.id}`,
                },
              ]}
            />
          );
        })()}
        <Group gap="xs">
          <StateChangeButton
            value={statusValue}
            defaultValue={statusValue}
            onChange={handleStatusChange}
            disabled={form.formState.isDirty}
            config={purchaseOrderStateConfig}
          />
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Tooltip label="Export" withArrow>
                <ActionIcon
                  size="lg"
                  variant="subtle"
                  aria-label="Export"
                  disabled={isDirty}
                >
                  <IconFileExport size={16} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={openPrint} disabled={isDirty}>
                Print
              </Menu.Item>
              <Menu.Item onClick={downloadPdf} disabled={isDirty}>
                Download PDF
              </Menu.Item>
              <Menu.Item onClick={emailDraft} disabled={isDirty}>
                Email draft (.eml)
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label="Purchase order actions"
              >
                <IconMenu2 size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={Link} to="/purchase-orders/new">
                New Purchase Order
              </Menu.Item>
              <Tooltip
                label="Can’t delete a PO with product movements. Reverse movements first."
                disabled={canDelete}
                withArrow
                position="left"
              >
                <span>
                  <Menu.Item
                    color="red"
                    disabled={!canDelete}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteConfirm("");
                      setDeleteOpen(true);
                    }}
                  >
                    Delete Purchase Order
                  </Menu.Item>
                </span>
              </Tooltip>
              <Menu.Item onClick={() => setDebugOpen(true)}>Debug</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          {/* Per-page prev/next removed (global header handles navigation) */}
        </Group>
      </Group>

      <PurchaseOrderDetailForm
        mode="edit"
        form={form as any}
        onSave={savePurchaseOrder}
        fieldCtx={fieldCtx}
        purchaseOrder={{
          ...purchaseOrder,
          vendorName: purchaseOrder.company?.name,
          consigneeName: purchaseOrder.consignee?.name,
          locationName: purchaseOrder.location?.name,
        }}
      >
        <Grid.Col span={{ base: 12 }}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Group gap="sm" align="center" wrap="nowrap">
                  <Title order={5}>Lines</Title>
                  <SegmentedControl
                    size="xs"
                    ml="lg"
                    value={linesViewMode}
                    onChange={(value) =>
                      setLinesViewMode(value as "status" | "extended")
                    }
                    data={[
                      { value: "status", label: "Status" },
                      { value: "extended", label: "Extended" },
                    ]}
                  />
                </Group>
                <Group gap="xs">
                  {!isDraft ? (
                    <Tooltip
                      label="Add at least one line to receive."
                      disabled={lineCount > 0}
                      withArrow
                    >
                      <span style={{ display: "inline-block" }}>
                        <Button
                          size="xs"
                          onClick={() => setReceiveOpen(true)}
                          disabled={isDirty || lineCount === 0}
                        >
                          Receive…
                        </Button>
                      </span>
                    </Tooltip>
                  ) : null}
                  <Tooltip
                    label="To modify line items, switch back to Draft."
                    disabled={isDraft}
                    withArrow
                  >
                    <span>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setAddOpen(true)}
                        disabled={!isDraft}
                      >
                        Add Line
                      </Button>
                    </span>
                  </Tooltip>
                </Group>
              </Group>
            </Card.Section>
            <Modal
              opened={addOpen}
              onClose={() => setAddOpen(false)}
              title="Add PO Line"
              centered
              size="xl"
            >
              <Stack gap="sm">
                {/* Product select using API-backed search to avoid loading all options */}
                <AsyncProductSearch
                  key={productPickerKey}
                  value={newProductId}
                  onChange={setNewProductId}
                  autoFocus
                  focusKey={productSearchFocusKey}
                  supplierId={purchaseOrder.companyId ?? null}
                />
                <Group justify="flex-end">
                  <Button variant="default" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => doAddLine(true)}
                    disabled={isDirty || newProductId == null}
                  >
                    Add + Next
                  </Button>
                  <Button
                    onClick={() => doAddLine(false)}
                    disabled={isDirty || newProductId == null}
                  >
                    Add
                  </Button>
                </Group>
              </Stack>
            </Modal>
            <Card.Section>
              <PurchaseOrderLinesTable
                form={form as any}
                status={statusValue}
                productMap={productMap}
                pricingPrefs={pricingPrefs}
                purchaseDate={purchaseOrder.date ?? null}
                vendorLeadTimeDays={
                  purchaseOrder.company?.defaultLeadTimeDays ?? null
                }
                onOpenReservations={setReservationLine}
                viewMode={linesViewMode}
              />
            </Card.Section>
            {variantBreakdownGroups.length > 0 && (
              <Card.Section inheritPadding py="md">
                <VariantBreakdownSection
                  groups={variantBreakdownGroups}
                  lineHeader="PO Line"
                  renderLineLabel={(line: any) => (
                    <Stack gap={0}>
                      <Text size="sm">
                        {line.product?.sku ||
                          line.productSkuCopy ||
                          `Line ${line.id}`}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {line.assembly?.name ||
                          (line.assemblyId
                            ? `Assembly ${line.assemblyId}`
                            : "")}
                      </Text>
                    </Stack>
                  )}
                />
              </Card.Section>
            )}
          </Card>
        </Grid.Col>
      </PurchaseOrderDetailForm>

      <DebugDrawer
        opened={debugOpen}
        onClose={() => setDebugOpen(false)}
        title={`Debug – PO ${purchaseOrder.id}`}
        payload={debugPayload}
        loading={false}
        formStateCopyText={debugText}
        formStatePanel={
          <FormProvider {...form}>
            <FormStateDebugPanel
              formId={`po-${purchaseOrder.id}`}
              getDefaultValues={() => purchaseOrder}
              collapseLong
              dirtySources={{
                rhf: {
                  isDirty: form.formState.isDirty,
                  dirtyFieldsCount: Object.keys(
                    form.formState.dirtyFields || {}
                  ).length,
                  touchedFieldsCount: Object.keys(
                    form.formState.touchedFields || {}
                  ).length,
                  submitCount: form.formState.submitCount,
                  formInstanceId: null,
                },
              }}
              formInstances={{}}
              assertions={{}}
            />
          </FormProvider>
        }
      />

      <Modal
        opened={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteConfirm("");
          setDeleteError(null);
        }}
        title="Delete purchase order?"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            This action cannot be undone. Type the confirmation phrase to
            proceed.
          </Text>
          <TextInput
            label={`Type ${deletePhrase}`}
            placeholder={deletePhrase}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.currentTarget.value)}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (deleteConfirm !== deletePhrase || !canDelete) return;
              const fd = new FormData();
              fd.set("_intent", "po.delete");
              fd.set("confirm", deleteConfirm);
              submit(fd, { method: "post" });
            }}
          />
          {deleteError ? (
            <Text size="sm" c="red">
              {deleteError}
            </Text>
          ) : null}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteConfirm("");
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              type="button"
              disabled={deleteConfirm !== deletePhrase || !canDelete}
              onClick={() => {
                const fd = new FormData();
                fd.set("_intent", "po.delete");
                fd.set("confirm", deleteConfirm);
                submit(fd, { method: "post" });
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || "receipts")}
        mt="xl"
      >
        <Tabs.List>
          <Tabs.Tab value="receipts">Receipts ({receiptLines.length})</Tabs.Tab>
          <Tabs.Tab value="supplier-invoices">
            Supplier Invoices ({(supplierInvoices || []).length})
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="receipts" pt="md">
          {/* Receipts tied to this PO */}
          <Card withBorder padding="md" bg="transparent">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Title order={5}>Receipts</Title>
              </Group>
            </Card.Section>
            <Card.Section>
              <Table withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Receipt ID</Table.Th>
                    <Table.Th>PO Line</Table.Th>
                    <Table.Th>Product</Table.Th>
                    <Table.Th>Qty</Table.Th>
                    <Table.Th>Batches</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {receiptLines.map((line: any) => {
                    const meta = receiptLineMetaById[line.id] || {
                      batches: [],
                      movementCount: 0,
                    };
                    const batches = meta.batches || [];
                    const batchPreview = batches.slice(0, 2);
                    const remaining = batches.length - batchPreview.length;
                    return (
                      <Table.Tr key={`receipt-line-${line.id}`}>
                        <Table.Td>
                          {formatReceiptDate(line.shipmentDate)}
                        </Table.Td>
                        <Table.Td>{line.shipmentId ?? "—"}</Table.Td>
                        <Table.Td>{line.purchaseOrderLineId ?? "—"}</Table.Td>
                        <Table.Td>
                          {line.productId ? (
                            <JumpLink
                              to={`/products/${line.productId}`}
                              label={
                                [line.product?.sku, line.product?.name]
                                  .filter(Boolean)
                                  .join(" · ") || line.productId
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </Table.Td>
                        <Table.Td>{Number(line.quantity || 0) || 0}</Table.Td>
                        <Table.Td>
                          {batches.length ? (
                            <Tooltip
                              withArrow
                              label={batches.map(formatBatchLabel).join(" · ")}
                            >
                              <Group gap={4} wrap="nowrap">
                                {batchPreview.map((b: any) => (
                                  <AxisChip
                                    key={`${line.id}-${b.id}`}
                                    tone="neutral"
                                  >
                                    {formatBatchLabel(b)}
                                  </AxisChip>
                                ))}
                                {remaining > 0 ? (
                                  <AxisChip tone="neutral">
                                    +{remaining}
                                  </AxisChip>
                                ) : null}
                              </Group>
                            </Tooltip>
                          ) : (
                            "—"
                          )}
                        </Table.Td>
                        <Table.Td>
                          <ReceiptLineDeleteMenu
                            receiptLineId={line.id}
                            onDelete={(lid) => {
                              const fd = new FormData();
                              fd.set("_intent", "po.receive.delete");
                              fd.set("shipmentLineId", String(lid));
                              fd.set("poId", String(purchaseOrder.id));
                              deleteFetcher.submit(fd, { method: "post" });
                            }}
                          />
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                  {receiptLines.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <em>No receipts yet.</em>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Card.Section>
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="supplier-invoices" pt="md">
          <Card withBorder padding="md" bg="transparent">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Group gap="xs" align="center" wrap="wrap">
                  <Title order={5}>Supplier Invoices</Title>
                  {receiptMissingWarning ? (
                    <Tooltip
                      withArrow
                      label="Invoices have been recorded, but no receipts exist for this PO."
                    >
                      <AxisChip
                        tone="warning"
                        onClick={() => setActiveTab("receipts")}
                        style={{ cursor: "pointer" }}
                        title="Record receipt"
                      >
                        {receiptMissingWarning.label}
                      </AxisChip>
                    </Tooltip>
                  ) : null}
                  {invoiceMismatchWarning ? (
                    <Tooltip
                      withArrow
                      label={
                        <Stack gap={2}>
                          <Text size="xs">
                            Expected (inc tax):{" "}
                            {formatUSD(
                              Number(invoiceMismatchWarning.meta?.expected ?? 0)
                            )}
                          </Text>
                          <Text size="xs">
                            Invoiced (inc tax):{" "}
                            {formatUSD(
                              Number(invoiceMismatchWarning.meta?.invoiced ?? 0)
                            )}
                          </Text>
                          <Text size="xs">
                            Delta (inc tax):{" "}
                            {formatUSD(
                              Number(invoiceMismatchWarning.meta?.delta ?? 0)
                            )}
                          </Text>
                        </Stack>
                      }
                    >
                      <AxisChip
                        tone="warning"
                        onClick={openAdjustCosts}
                        style={{ cursor: "pointer" }}
                        title="Adjust costs to reconcile invoice delta"
                      >
                        {invoiceMismatchWarning.label}
                      </AxisChip>
                    </Tooltip>
                  ) : null}
                  {recordInvoiceWarning ? (
                    <AxisChip
                      tone="info"
                      onClick={() => {
                        setActiveTab("supplier-invoices");
                      }}
                      style={{ cursor: "pointer" }}
                      title="Record supplier invoices for this PO"
                    >
                      {recordInvoiceWarning.label}
                    </AxisChip>
                  ) : null}
                  {invoiceTrackingStatus === "NO_INVOICE_EXPECTED" ? (
                    <AxisChip
                      tone="neutral"
                      onClick={() => updateInvoiceTracking("UNKNOWN")}
                      style={{ cursor: "pointer" }}
                      title="Undo invoice waiver"
                    >
                      Invoices waived
                    </AxisChip>
                  ) : null}
                </Group>
                <Group gap="xs">
                  {invoiceTrackingStatus !== "NO_INVOICE_EXPECTED" ? (
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() =>
                        updateInvoiceTracking("NO_INVOICE_EXPECTED")
                      }
                    >
                      Mark no invoices
                    </Button>
                  ) : null}
                  {hasInvoiceMismatch ? (
                    <Button size="xs" variant="light" onClick={openAdjustCosts}>
                      Adjust costs…
                    </Button>
                  ) : null}
                </Group>
              </Group>
            </Card.Section>
            <Card.Section inheritPadding py="xs">
              <Group gap="xl" align="center">
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    Expected (inc tax)
                  </Text>
                  <Text size="sm">{formatUSD(expectedIncTax)}</Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    Invoiced (inc tax)
                  </Text>
                  <Text size="sm">{formatUSD(invoicedIncTax)}</Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    Delta (inc tax)
                  </Text>
                  <Text size="sm">{formatUSD(deltaIncTax)}</Text>
                </Stack>
              </Group>
            </Card.Section>
            {hasInvoiceMismatch ? (
              <Card.Section inheritPadding py="xs">
                <Alert color="yellow" title="Invoice delta (inc tax)">
                  Invoiced totals do not match expected PO costs (including
                  tax). Consider adjusting line costs to reconcile the delta.
                </Alert>
              </Card.Section>
            ) : null}
            <Card.Section>
              <Table withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Invoice #</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Amount (ex tax)</Table.Th>
                    <Table.Th>Tax Code</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(supplierInvoices || []).map((inv: any) => {
                    const sign = inv.type === "CREDIT_MEMO" ? -1 : 1;
                    const amount = (Number(inv.totalExTax ?? 0) || 0) * sign;
                    const invType =
                      inv.type === "CREDIT_MEMO"
                        ? "Credit Memo"
                        : inv.type === "INVOICE"
                        ? "Invoice"
                        : "—";
                    const dateLabel = inv.invoiceDate
                      ? new Date(inv.invoiceDate).toLocaleDateString()
                      : "—";
                    return (
                      <Table.Tr key={`supplier-invoice-${inv.id}`}>
                        <Table.Td>{dateLabel}</Table.Td>
                        <Table.Td>{inv.supplierInvoiceNo || "—"}</Table.Td>
                        <Table.Td>{invType}</Table.Td>
                        <Table.Td>{formatUSD(amount)}</Table.Td>
                        <Table.Td>{inv.taxCode || "—"}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                  {(supplierInvoices || []).length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <em>No supplier invoices yet.</em>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Card.Section>
          </Card>
        </Tabs.Panel>
      </Tabs>
      <Drawer
        opened={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        position="right"
        size="lg"
        title={`Adjust line costs – PO ${purchaseOrder.id}`}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Update unit costs for received quantities. Expected totals update as
            you edit costs.
          </Text>
          <Table withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>PO Line</Table.Th>
                <Table.Th>Product</Table.Th>
                <Table.Th>Qty Received</Table.Th>
                <Table.Th>Current Unit Cost</Table.Th>
                <Table.Th>Expected</Table.Th>
                <Table.Th>New Unit Cost</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(purchaseOrder.lines || []).map((line: any) => {
                const qtyReceived = Number(line.qtyReceived ?? 0) || 0;
                const currentCost =
                  Number(line.manualCost ?? line.priceCost ?? 0) || 0;
                const newCost =
                  adjustCosts[line.id] == null
                    ? currentCost
                    : Number(adjustCosts[line.id] ?? 0);
                const expectedLine = qtyReceived * newCost;
                return (
                  <Table.Tr key={`adjust-line-${line.id}`}>
                    <Table.Td>{line.id}</Table.Td>
                    <Table.Td>
                      {[line.product?.sku, line.product?.name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Table.Td>
                    <Table.Td>{qtyReceived}</Table.Td>
                    <Table.Td>{formatUSD(currentCost)}</Table.Td>
                    <Table.Td>{formatUSD(expectedLine)}</Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={
                          adjustCosts[line.id] == null
                            ? currentCost
                            : adjustCosts[line.id]
                        }
                        onChange={(value) => {
                          const next =
                            value == null || value === ""
                              ? null
                              : Number(value);
                          setAdjustCosts((prev) => ({
                            ...prev,
                            [line.id]: next,
                          }));
                        }}
                        min={0}
                        step={0.01}
                        decimalScale={8}
                        w={140}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {(purchaseOrder.lines || []).length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <em>No lines to adjust.</em>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Expected (updated)
              </Text>
              <Text size="sm">{formatUSD(adjustedExpectedIncTax)}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Delta (updated)
              </Text>
              <Text size="sm">{formatUSD(adjustedDeltaIncTax)}</Text>
            </Stack>
          </Group>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdjustCosts} disabled={!hasAdjustChanges}>
              Save adjustments
            </Button>
          </Group>
        </Stack>
      </Drawer>
      <POReceiveModal
        opened={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        poId={purchaseOrder.id}
        poLocationId={purchaseOrder.locationId ?? null}
        lines={(purchaseOrder.lines || []).map((l: any) => ({
          id: l.id,
          productId: l.productId,
          sku: l.product?.sku,
          name: l.product?.name,
          qtyOrdered: l.quantityOrdered,
          qtyReceived: l.qtyReceived,
          stockTrackingEnabled: l.product?.stockTrackingEnabled ?? null,
          batchTrackingEnabled: l.product?.batchTrackingEnabled ?? null,
          productType: l.product?.type ?? null,
        }))}
      />
      <Drawer
        opened={!!reservationLine}
        onClose={() => setReservationLine(null)}
        position="right"
        size="lg"
        title={
          reservationLine
            ? `Reservations – Line ${reservationLine.id}`
            : "Reservations"
        }
      >
        {reservationLine ? (
          <LineReservationsPanel
            line={reservationLine}
            fetcher={reservationFetcher}
            submitting={reservationFetcher.state !== "idle"}
          />
        ) : null}
      </Drawer>
    </Stack>
  );
}

export default function PurchaseOrderDetailLayout() {
  return <Outlet />;
}

function LineReservationsPanel({
  line,
  fetcher,
  submitting,
}: {
  line: any;
  fetcher: ReturnType<typeof useFetcher>;
  submitting: boolean;
}) {
  const [localValues, setLocalValues] = useState<
    Record<number, { qty: string; note: string }>
  >({});
  useEffect(() => {
    const next: Record<number, { qty: string; note: string }> = {};
    (line.reservations || [])
      .filter((res: any) => !res.settledAt)
      .forEach((res: any) => {
        next[res.id] = {
          qty: String(Number(res.qtyReserved) || 0),
          note: res.note ?? "",
        };
      });
    setLocalValues(next);
  }, [line.id, line.reservations]);
  const formatQty = (value: number | null | undefined) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString();
  };
  const reservedQty =
    Number(line.reservedQty ?? 0) ||
    (line.reservations || []).reduce(
      (sum: number, res: any) =>
        res.settledAt ? sum : sum + (Number(res.qtyReserved) || 0),
      0
    );
  const expectedQty = Number(line.qtyExpected ?? 0) || 0;
  const orderedQty = Number(line.quantityOrdered ?? 0) || 0;
  const overReserved = Math.max(reservedQty - expectedQty, 0);
  const remainingQty =
    line.availableQty != null
      ? Number(line.availableQty) || 0
      : Math.max(
          expectedQty - (Number(line.qtyReceived || 0) || 0) - reservedQty,
          0
        );
  const updateValue = (id: number, field: "qty" | "note", value: string) => {
    setLocalValues((prev) => ({
      ...prev,
      [id]: {
        qty: field === "qty" ? value : prev[id]?.qty ?? "",
        note: field === "note" ? value : prev[id]?.note ?? "",
      },
    }));
  };
  const handleUpdate = (reservationId: number) => {
    const entry = localValues[reservationId];
    if (!entry) return;
    const fd = new FormData();
    fd.set("_intent", "reservation.update");
    fd.set("reservationId", String(reservationId));
    fd.set("qty", entry.qty ?? "0");
    fd.set("note", entry.note ?? "");
    fetcher.submit(fd, { method: "post" });
  };
  const handleDelete = (reservationId: number) => {
    const fd = new FormData();
    fd.set("_intent", "reservation.delete");
    fd.set("reservationId", String(reservationId));
    fetcher.submit(fd, { method: "post" });
  };
  const handleTrim = () => {
    if (!line?.id) return;
    const fd = new FormData();
    fd.set("_intent", "reservations.trim");
    fd.set("lineId", String(line.id));
    fd.set("strategy", "newest");
    fetcher.submit(fd, { method: "post" });
  };
  const currentActionId =
    fetcher.formData && fetcher.formData.has("reservationId")
      ? Number(fetcher.formData.get("reservationId"))
      : null;
  const currentIntent = fetcher.formData?.get("_intent") ?? null;
  const isUpdating = (id: number) =>
    fetcher.state !== "idle" &&
    currentIntent === "reservation.update" &&
    currentActionId === id;
  const isDeleting = (id: number) =>
    fetcher.state !== "idle" &&
    currentIntent === "reservation.delete" &&
    currentActionId === id;
  const isTrimming =
    fetcher.state !== "idle" && currentIntent === "reservations.trim";
  const activeReservations = (line.reservations || []).filter(
    (res: any) => !res.settledAt
  );
  const settledReservations = (line.reservations || []).filter(
    (res: any) => res.settledAt
  );

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          Expected {formatQty(expectedQty)} · Ordered {formatQty(orderedQty)} ·
          Received {formatQty(line.qtyReceived)} · Reserved{" "}
          {formatQty(reservedQty)} · Remaining {formatQty(remainingQty)}
        </Text>
        {overReserved > 0 ? (
          <Badge color="red" size="sm">
            OVER-RESERVED
          </Badge>
        ) : null}
      </Group>
      {overReserved > 0 ? (
        <Group justify="flex-end">
          <Button
            size="xs"
            variant="light"
            onClick={handleTrim}
            loading={isTrimming}
            disabled={submitting}
          >
            Trim reservations to expected
          </Button>
        </Group>
      ) : null}
      {fetcher.data?.error ? (
        <Text size="sm" c="red">
          {String(fetcher.data.error)}
        </Text>
      ) : null}
      {(line.reservations || []).length === 0 ? (
        <Text c="dimmed">No reservations yet.</Text>
      ) : (
        <Stack gap="sm">
          {activeReservations.length ? (
            <Stack gap="sm">
              <Text size="sm" fw={600}>
                Active reservations
              </Text>
              {activeReservations.map((res: any) => {
                const entry = localValues[res.id] || { qty: "", note: "" };
                return (
                  <Card key={res.id} withBorder padding="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text fw={600}>
                            Assembly A{res.assembly?.id ?? "—"}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {res.assembly?.name || "—"}
                            {res.assembly?.job
                              ? ` • Job ${res.assembly.job.id}${
                                  res.assembly.job.name
                                    ? ` (${res.assembly.job.name})`
                                    : ""
                                }`
                              : ""}
                          </Text>
                        </Stack>
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            loading={isUpdating(res.id)}
                            onClick={() => handleUpdate(res.id)}
                            disabled={submitting}
                          >
                            Save
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            loading={isDeleting(res.id)}
                            onClick={() => handleDelete(res.id)}
                            disabled={submitting}
                          >
                            Remove
                          </Button>
                        </Group>
                      </Group>
                      <Group gap="sm" grow>
                        <NumberInput
                          label="Reserved qty"
                          value={Number(entry.qty ?? 0)}
                          onChange={(val) =>
                            updateValue(
                              res.id,
                              "qty",
                              val != null ? String(val) : "0"
                            )
                          }
                          min={0}
                          disabled={submitting}
                        />
                        <TextInput
                          label="Note"
                          value={entry.note}
                          onChange={(e) =>
                            updateValue(res.id, "note", e.currentTarget.value)
                          }
                          disabled={submitting}
                        />
                      </Group>
                      <Text size="xs" c="dimmed">
                        Reserved {formatQty(res.qtyReserved)} · Created{" "}
                        {res.createdAt
                          ? new Date(res.createdAt as any).toLocaleString()
                          : "—"}
                      </Text>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          ) : null}
          {settledReservations.length ? (
            <Stack gap="sm">
              <Text size="sm" fw={600}>
                History (settled)
              </Text>
              {settledReservations.map((res: any) => {
                const settledAt = res.settledAt
                  ? new Date(res.settledAt as any).toLocaleString()
                  : null;
                return (
                  <Card key={res.id} withBorder padding="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text fw={600}>
                            Assembly A{res.assembly?.id ?? "—"}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {res.assembly?.name || "—"}
                            {res.assembly?.job
                              ? ` • Job ${res.assembly.job.id}${
                                  res.assembly.job.name
                                    ? ` (${res.assembly.job.name})`
                                    : ""
                                }`
                              : ""}
                          </Text>
                        </Stack>
                        <Badge color="gray" size="sm" variant="light">
                          Settled
                        </Badge>
                      </Group>
                      <Group gap="sm" grow>
                        <NumberInput
                          label="Reserved qty"
                          value={Number(res.qtyReserved ?? 0)}
                          min={0}
                          disabled
                        />
                        <TextInput
                          label="Note"
                          value={res.note ?? ""}
                          disabled
                        />
                      </Group>
                      <Text size="xs" c="dimmed">
                        Reserved {formatQty(res.qtyReserved)} (settled) ·
                        {settledAt ? ` Settled ${settledAt}` : " Settled —"} ·
                        Created{" "}
                        {res.createdAt
                          ? new Date(res.createdAt as any).toLocaleString()
                          : "—"}
                      </Text>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}

function ReceiptLineDeleteMenu({
  receiptLineId,
  onDelete,
}: {
  receiptLineId: number;
  onDelete: (receiptLineId: number) => void;
}) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="Receipt actions">
          <IconMenu2 size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Receipt Line</Menu.Label>
        <Menu.Item
          leftSection={<IconTrash size={14} />}
          color="red"
          onClick={() => {
            modals.openConfirmModal({
              title: "Delete receipt line?",
              children: (
                <Text size="sm">
                  This will delete the receipt line and any derived movements or
                  batches created from it. It cannot be undone.
                </Text>
              ),
              labels: { confirm: "Delete", cancel: "Cancel" },
              confirmProps: { color: "red" },
              onConfirm: () => onDelete(receiptLineId),
            });
          }}
        >
          Delete Receipt Line
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function resolveExpectedQty(
  line:
    | {
        quantity?: number | string | null;
        quantityOrdered?: number | string | null;
      }
    | null
    | undefined
) {
  if (!line) return 0;
  const qty = Number(line.quantity ?? 0) || 0;
  const ordered = Number(line.quantityOrdered ?? 0) || 0;
  if (qty > 0) return qty;
  if (ordered > 0) return ordered;
  return qty || ordered || 0;
}

function AsyncProductSearch({
  value,
  onChange,
  autoFocus,
  focusKey,
  supplierId,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  autoFocus?: boolean;
  focusKey?: number;
  supplierId?: number | null;
}) {
  const [data, setData] = useState<
    Array<{ value: string; sku?: string | null; name?: string | null }>
  >([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, focusKey]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = search.trim();
    if (!supplierId) {
      setData([]);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({
      limit: "50",
      supplierId: String(supplierId),
    });
    if (trimmed) params.set("q", trimmed);
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/products/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const js = await resp.json();
        const opts = (js.products || []).map((p: any) => ({
          value: String(p.id),
          sku: p.sku ?? "",
          name: p.name ?? "",
          productStage: p.productStage ?? null,
        }));
        if (!cancelled) setData(opts);
      } catch (err) {
        if (!cancelled) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(t);
    };
  }, [search, supplierId]);

  const handlePick = (val: string) => {
    const n = Number(val);
    onChange(Number.isFinite(n) ? n : null);
  };

  return (
    <Stack gap="xs">
      <TextInput
        label="Product"
        placeholder="Search products…"
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setSearch(e.currentTarget.value)
        }
        autoFocus={autoFocus}
        ref={inputRef}
      />
      <ScrollArea h={360} type="always" offsetScrollbars>
        {loading && (
          <div style={{ padding: 8, color: "var(--mantine-color-dimmed)" }}>
            Searching…
          </div>
        )}
        {!loading && !supplierId && (
          <div style={{ padding: 8, color: "var(--mantine-color-dimmed)" }}>
            Select a Vendor first to search products.
          </div>
        )}
        {!loading && supplierId && data.length === 0 && (
          <div style={{ padding: 8, color: "var(--mantine-color-dimmed)" }}>
            No products
          </div>
        )}
        {!loading && supplierId && data.length > 0 && (
          <Table>
            <Table.Tbody>
              {data.map((opt) => {
                const selected = value != null && String(value) === opt.value;
                return (
                  <Table.Tr
                    key={opt.value}
                    onClick={() => handlePick(opt.value)}
                    style={{
                      cursor: "pointer",
                      background: selected
                        ? "var(--mantine-color-placeholder)"
                        : "transparent",
                    }}
                  >
                    <Table.Td style={{ width: 160 }}>{opt.sku}</Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text>{opt.name}</Text>
                        <ProductStageIndicator stage={opt.productStage} />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </ScrollArea>
    </Stack>
  );
}
