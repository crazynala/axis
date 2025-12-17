import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Outlet,
  useFetcher,
  useRouteLoaderData,
  useSubmit,
  useRevalidator,
} from "@remix-run/react";
import {
  prisma,
  refreshProductStockSnapshot,
} from "../../../utils/prisma.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import {
  Card,
  Group,
  Stack,
  Title,
  Table,
  Button,
  ScrollArea,
  TextInput,
  Text,
  Menu,
  ActionIcon,
  Drawer,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { Controller, useForm, useWatch } from "react-hook-form";
import { NumberInput } from "@mantine/core";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import { PurchaseOrderDetailForm } from "~/modules/purchaseOrder/forms/PurchaseOrderDetailForm";
// Using an async product search in this route instead of the shared ProductSelect
import { useState, useEffect, useRef, useMemo } from "react";
import { useRecordContext } from "../../../base/record/RecordContext";
import { formatUSD } from "../../../utils/format";
import { POReceiveModal } from "../../../components/POReceiveModal";
import { marshallPurchaseOrderToPrisma } from "../helpers/purchaseOrderMarshallers";
import { ProductPricingService } from "~/modules/product/services/ProductPricingService";
// calcPrice no longer used in this route; pricing handled in lines table
import { PurchaseOrderLinesTable } from "~/modules/purchaseOrder/components/PurchaseOrderLinesTable";
import { getSavedIndexSearch } from "~/hooks/useNavLocation";
import { IconMenu2, IconTrash, IconFileExport } from "@tabler/icons-react";
import { VariantBreakdownSection } from "../../../components/VariantBreakdownSection";
import {
  groupVariantBreakdowns,
  resolveVariantSourceFromLine,
} from "../../../utils/variantBreakdown";

const parseDateInput = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
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
            include: {
              purchaseTax: true,
              variantSet: { select: { id: true, name: true, variants: true } },
            },
          },
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

  // Derive shipped/received from Product Movements to make PMs the source of truth
  const lineIds = (purchaseOrder.lines || []).map((l: any) => l.id);
  let receivedByLine = new Map<number, number>();
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
      if (t === "po (receive)") {
        receivedByLine.set(lid, (receivedByLine.get(lid) || 0) + qty);
      } else if (t === "po (ship)") {
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
    const qtyOrdered = Number(l.quantityOrdered ?? l.quantity ?? 0) || 0;
    const reservations = reservationsByLine.get(l.id) || [];
    const reservedQty = reservations.reduce(
      (sum, res) => sum + (Number(res.qtyReserved) || 0),
      0
    );
    return {
      ...l,
      qtyReceived,
      qtyShipped: shippedByLine.get(l.id) || 0,
      reservations,
      reservedQty,
      availableQty: Math.max(qtyOrdered - qtyReceived - reservedQty, 0),
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
      const cost = Number(l.priceCost ?? 0);
      const sell = Number(l.priceSell ?? 0);
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

  // Fetch related Product Movements (headers + lines) tied to this PO's lines
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

  return json({
    purchaseOrder: poWithComputed,
    totals,
    productOptions,
    poMovements,
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

  if (intent === "reservation.update") {
    const reservationId = Number(form.get("reservationId"));
    const qtyRaw = form.get("qty");
    const noteRaw = form.get("note");
    if (!Number.isFinite(reservationId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const qty =
      qtyRaw == null || String(qtyRaw).trim() === ""
        ? 0
        : Number(qtyRaw);
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
    if (
      !reservation ||
      reservation.purchaseOrderLine?.purchaseOrderId !== id
    ) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    const qtyOrdered =
      Number(
        reservation.purchaseOrderLine?.quantityOrdered ??
          reservation.purchaseOrderLine?.quantity ??
          0
      ) || 0;
    const qtyReceived =
      Number(reservation.purchaseOrderLine?.qtyReceived ?? 0) || 0;
    const otherTotals = await prisma.supplyReservation.aggregate({
      _sum: { qtyReserved: true },
      where: {
        purchaseOrderLineId: reservation.purchaseOrderLineId ?? undefined,
        NOT: { id: reservationId },
      },
    });
    const otherReserved = Number(otherTotals._sum.qtyReserved ?? 0);
    const maxAllowed = Math.max(qtyOrdered - qtyReceived - otherReserved, 0);
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
          typeof noteRaw === "string" && noteRaw.trim()
            ? noteRaw.trim()
            : null,
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
    if (
      !reservation ||
      reservation.purchaseOrderLine?.purchaseOrderId !== id
    ) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    await prisma.supplyReservation.delete({ where: { id: reservationId } });
    return json({ ok: true });
  }

  if (intent === "po.update") {
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
        await prisma.purchaseOrderLine.update({
          where: { id: ln.id },
          data: {
            productSkuCopy: prod.sku ?? null,
            productNameCopy: prod.name ?? null,
            priceCost: cost,
            priceSell: sell,
            taxRate: taxRate,
            quantity: ln.quantityOrdered ?? 0,
          },
        });
      }
    } else {
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
            await prisma.purchaseOrderLine.create({
              data: {
                id: nextLineId++,
                purchaseOrderId: id,
                productId,
                quantityOrdered,
                quantity: 0,
                etaDate,
                etaDateConfirmed,
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
        for (const lid of existingIdSet) {
          const l = incomingById.get(lid);
          if (!l) continue;
          const productId = Number(l?.productId);
          const quantityOrdered = Number(l?.quantityOrdered ?? 0) || 0;
          const patch: any = {};
          if (Number.isFinite(productId) && productId > 0)
            patch.productId = productId;
          patch.quantityOrdered = quantityOrdered;
          if ("etaDate" in l) {
            patch.etaDate = parseDateInput(l?.etaDate);
          }
          if ("etaDateConfirmed" in l) {
            patch.etaDateConfirmed = Boolean(l?.etaDateConfirmed);
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
              },
            });
            const mls = await prisma.productMovementLine.findMany({
              where: { purchaseOrderLineId: { in: lineIds } },
              select: {
                purchaseOrderLineId: true,
                quantity: true,
                movement: { select: { movementType: true } },
              },
            });
            const receivedMap = new Map<number, number>();
            for (const ml of mls) {
              const t = (ml.movement?.movementType || "").toLowerCase();
              if (t !== "po (receive)") continue;
              const lid = Number(ml.purchaseOrderLineId);
              receivedMap.set(
                lid,
                (receivedMap.get(lid) || 0) + Number(ml.quantity || 0)
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
              await prisma.purchaseOrderLine.update({
                where: { id: lid },
                data: { quantity: finalQty },
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
          const mls = await prisma.productMovementLine.findMany({
            where: { purchaseOrderLineId: { in: ids } },
            select: {
              purchaseOrderLineId: true,
              quantity: true,
              movement: { select: { movementType: true } },
            },
          });
          const receivedMap = new Map<number, number>();
          for (const ml of mls) {
            const t = (ml.movement?.movementType || "").toLowerCase();
            if (t !== "po (receive)") continue;
            const lid = Number(ml.purchaseOrderLineId);
            receivedMap.set(
              lid,
              (receivedMap.get(lid) || 0) + Number(ml.quantity || 0)
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
            status: "RECEIVED",
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
          const existingReceives = await tx.productMovementLine.findMany({
            where: { purchaseOrderLineId: { in: payloadLineIds } },
            select: {
              purchaseOrderLineId: true,
              quantity: true,
              movement: { select: { movementType: true } },
            },
          });
          for (const ml of existingReceives) {
            const t = (ml.movement?.movementType || "").toLowerCase();
            if (t !== "po (receive)") continue;
            const lid = Number(ml.purchaseOrderLineId);
            if (!Number.isFinite(lid)) continue;
            receivedTotals.set(
              lid,
              (receivedTotals.get(lid) || 0) + Number(ml.quantity || 0)
            );
          }
        }
        const lineQuantityMap = new Map<number, number>();
        const touchedLineIds = new Set<number>();

        for (const row of payload) {
          // Validate line belongs to PO and product matches
          const line = await tx.purchaseOrderLine.findUnique({
            where: { id: row.lineId },
            select: {
              id: true,
              purchaseOrderId: true,
              productId: true,
              quantityOrdered: true,
              quantity: true,
              qtyReceived: true,
            },
          });
          if (!line || line.purchaseOrderId !== poId)
            throw new Error("PO_RECEIVE: Invalid PO line");
          if (Number(line.productId) !== Number(row.productId))
            throw new Error("PO_RECEIVE: Product mismatch for PO line");

          if (!lineQuantityMap.has(line.id)) {
            lineQuantityMap.set(line.id, Number(line.quantity || 0) || 0);
          }

          const batches = Array.isArray(row.batches) ? row.batches : [];
          const sum = batches.reduce((t, b) => t + (Number(b.qty) || 0), 0);
          if (sum <= 0) continue; // nothing to do for this row

          const qtyOrdered = Number(line.quantityOrdered || 0);
          const alreadyReceived = receivedTotals.get(line.id) || 0;
          const remaining = Math.max(0, qtyOrdered - alreadyReceived);
          // Allow over-receive: do not block if sum > remaining; we accept and record movement as-is.

          const nextTotalReceived = alreadyReceived + sum;
          receivedTotals.set(line.id, nextTotalReceived);
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

          // Do not update line fields; received/shipped are derived from movements
        }

        if (touchedLineIds.size) {
          for (const lid of touchedLineIds) {
            const totalReceived = receivedTotals.get(lid) || 0;
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
          const mls = await prisma.productMovementLine.findMany({
            where: { purchaseOrderLineId: { in: ids } },
            select: {
              purchaseOrderLineId: true,
              quantity: true,
              movement: { select: { movementType: true } },
            },
          });
          const receivedMap = new Map<number, number>();
          for (const ml of mls) {
            const t = (ml.movement?.movementType || "").toLowerCase();
            if (t !== "po (receive)") continue;
            const lid = Number(ml.purchaseOrderLineId);
            receivedMap.set(
              lid,
              (receivedMap.get(lid) || 0) + Number(ml.quantity || 0)
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
    const movementId = Number(form.get("movementId"));
    if (!Number.isFinite(poId) || !Number.isFinite(movementId)) {
      return json({ error: "Invalid ids" }, { status: 400 });
    }
    // Validate movement exists and belongs to this PO
    const mv = await prisma.productMovement.findUnique({
      where: { id: movementId },
      select: {
        id: true,
        movementType: true,
        purchaseOrderLineId: true,
        shippingLineId: true,
        lines: { select: { id: true, batchId: true } },
      },
    });
    if (!mv || (mv.movementType || "").toLowerCase() !== "po (receive)") {
      return json({ error: "Not a PO receive movement" }, { status: 400 });
    }
    if (!mv.purchaseOrderLineId) {
      return json(
        { error: "Movement is not linked to a PO line" },
        { status: 400 }
      );
    }
    const line = await prisma.purchaseOrderLine.findUnique({
      where: { id: mv.purchaseOrderLineId },
      select: { id: true, purchaseOrderId: true },
    });
    if (!line || line.purchaseOrderId !== poId) {
      return json(
        { error: "Movement does not belong to this PO" },
        { status: 400 }
      );
    }
    const batchIds = (mv.lines || [])
      .map((l) => Number(l.batchId))
      .filter((n) => Number.isFinite(n)) as number[];
    try {
      await prisma.$transaction(async (tx) => {
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
            if (s.size !== 1 || !s.has(movementId)) {
              throw new Error(
                "PO_RECEIVE_DELETE: Batch has other movements and cannot be deleted"
              );
            }
          }
        }
        // Delete movement lines for this movement
        await tx.productMovementLine.deleteMany({
          where: {
            OR: [{ movementId: movementId }, { productMovementId: movementId }],
          },
        });
        // Delete batches created by this movement (safe due to validation above)
        if (batchIds.length) {
          await tx.batch.deleteMany({ where: { id: { in: batchIds } } });
        }
        // Capture shipping line info before deleting header
        const shippingLineId = Number(mv.shippingLineId || 0) || null;
        let shipmentId: number | null = null;
        if (shippingLineId) {
          const sl = await tx.shipmentLine.findUnique({
            where: { id: shippingLineId },
            select: { id: true, shipmentId: true },
          });
          shipmentId = sl?.shipmentId ?? null;
        }
        // Delete header
        await tx.productMovement.delete({ where: { id: movementId } });
        // If a shipping line was associated, delete it if no other movements reference it
        if (mv.shippingLineId) {
          const others = await tx.productMovement.count({
            where: { shippingLineId: mv.shippingLineId },
          });
          if (others === 0) {
            await tx.shipmentLine.delete({
              where: { id: mv.shippingLineId as number },
            });
            // If the shipment now has no lines, delete the shipment
            if (shipmentId) {
              const remaining = await tx.shipmentLine.count({
                where: { shipmentId },
              });
              if (remaining === 0) {
                await tx.shipment.delete({ where: { id: shipmentId } });
              }
            }
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
          const mls = await prisma.productMovementLine.findMany({
            where: { purchaseOrderLineId: { in: ids } },
            select: {
              purchaseOrderLineId: true,
              quantity: true,
              movement: { select: { movementType: true } },
            },
          });
          const receivedMap = new Map<number, number>();
          for (const ml of mls) {
            const t = (ml.movement?.movementType || "").toLowerCase();
            if (t !== "po (receive)") continue;
            const lid = Number(ml.purchaseOrderLineId);
            receivedMap.set(
              lid,
              (receivedMap.get(lid) || 0) + Number(ml.quantity || 0)
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
  const { purchaseOrder, totals, productOptions, poMovements } =
    useRouteLoaderData<typeof loader>(
      "modules/purchaseOrder/routes/purchase-orders.$id"
    )!;
  const { setCurrentId } = useRecordContext();
  const submit = useSubmit();
  const deleteFetcher = useFetcher<{ error?: string }>();
  const reservationFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  // console.log("PO detail", purchaseOrder, totals);

  // Register current id in RecordContext
  useEffect(() => {
    setCurrentId(purchaseOrder.id);
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
  }, [
    reservationFetcher.state,
    reservationFetcher.data,
    revalidator,
  ]);

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
  // Wire Save/Discard with Global Form Context: Save posts form values; Discard resets to loader state
  useInitGlobalFormContext(
    form as any,
    (values: any) => {
      const fd = new FormData();
      fd.set("_intent", "po.update");
      fd.set("purchaseOrder", JSON.stringify(values));
      submit(fd, { method: "post" });
    },
    () => {
      // Discard resets back to last loaded data
      form.reset(purchaseOrder as any);
    }
  );

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
  const linesWatch: any[] =
    useWatch({ control: form.control, name: "lines" }) ||
    form.getValues("lines") ||
    [];

  // getLivePrices is obsolete; pricing moved into PurchaseOrderLinesTable via useMemo

  // Prev/Next hotkeys now handled globally in RecordProvider

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
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconFileExport size={14} />}
                disabled={isDirty}
              >
                Export
              </Button>
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
          <Button
            size="xs"
            onClick={() => setReceiveOpen(true)}
            disabled={isDirty}
          >
            Receive…
          </Button>
          {/* Per-page prev/next removed (global header handles navigation) */}
        </Group>
      </Group>

      <PurchaseOrderDetailForm
        mode="edit"
        form={form as any}
        purchaseOrder={{
          ...purchaseOrder,
          vendorName: purchaseOrder.company?.name,
          consigneeName: purchaseOrder.consignee?.name,
          locationName: purchaseOrder.location?.name,
        }}
        onStateChange={(v) => {
          form.setValue("status" as any, v, { shouldDirty: true });
          const fd = new FormData();
          fd.set("_intent", "po.update");
          fd.set("purchaseOrder", JSON.stringify(form.getValues()));
          submit(fd, { method: "post" });
        }}
      />

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={5}>Lines</Title>
            <Button
              size="xs"
              variant="light"
              onClick={() => setAddOpen(true)}
              disabled={isDirty}
            >
              Add Line
            </Button>
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
                      (line.assemblyId ? `Assembly ${line.assemblyId}` : "")}
                  </Text>
                </Stack>
              )}
            />
          </Card.Section>
        )}
      </Card>
      {/* Related movements tied to this PO */}
      <Card withBorder padding="md" bg="transparent" mt="xl">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={5}>PO Receive Movements</Title>
          </Group>
        </Card.Section>
        <Card.Section>
          <Table withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Move ID</Table.Th>
                <Table.Th>PO Line</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Product</Table.Th>
                <Table.Th>Batch</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Notes</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(poMovements || []).flatMap((m: any) => {
                const dateStr = m.date
                  ? new Date(m.date as any).toLocaleDateString()
                  : "";
                if (!m.lines?.length) {
                  return [
                    <Table.Tr key={`m-${m.id}`}>
                      <Table.Td>{dateStr}</Table.Td>
                      <Table.Td>{m.id}</Table.Td>
                      <Table.Td>{m.purchaseOrderLineId ?? ""}</Table.Td>
                      <Table.Td>{m.movementType}</Table.Td>
                      <Table.Td></Table.Td>
                      <Table.Td></Table.Td>
                      <Table.Td>{m.quantity ?? ""}</Table.Td>
                      <Table.Td>{m.notes ?? ""}</Table.Td>
                      <Table.Td>
                        <MovementDeleteMenu
                          movementId={m.id}
                          poId={purchaseOrder.id}
                          onDelete={(mid) => {
                            const fd = new FormData();
                            fd.set("_intent", "po.receive.delete");
                            fd.set("movementId", String(mid));
                            fd.set("poId", String(purchaseOrder.id));
                            deleteFetcher.submit(fd, { method: "post" });
                          }}
                        />
                      </Table.Td>
                    </Table.Tr>,
                  ];
                }
                return m.lines.map((ln: any) => (
                  <Table.Tr key={`m-${m.id}-l-${ln.id}`}>
                    <Table.Td>{dateStr}</Table.Td>
                    <Table.Td>{m.id}</Table.Td>
                    <Table.Td>
                      {ln.purchaseOrderLineId ?? m.purchaseOrderLineId ?? ""}
                    </Table.Td>
                    <Table.Td>{m.movementType}</Table.Td>
                    <Table.Td>
                      {[ln.product?.sku, ln.product?.name]
                        .filter(Boolean)
                        .join(" · ")}
                    </Table.Td>
                    <Table.Td>
                      {ln.batch
                        ? [
                            ln.batch.codeSartor,
                            ln.batch.codeMill,
                            ln.batch.name,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : ""}
                    </Table.Td>
                    <Table.Td>{ln.quantity ?? ""}</Table.Td>
                    <Table.Td>{m.notes ?? ""}</Table.Td>
                    <Table.Td>
                      <MovementDeleteMenu
                        movementId={m.id}
                        poId={purchaseOrder.id}
                        onDelete={(mid) => {
                          const fd = new FormData();
                          fd.set("_intent", "po.receive.delete");
                          fd.set("movementId", String(mid));
                          fd.set("poId", String(purchaseOrder.id));
                          deleteFetcher.submit(fd, { method: "post" });
                        }}
                      />
                    </Table.Td>
                  </Table.Tr>
                ));
              })}
              {(!poMovements || poMovements.length === 0) && (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <em>No related movements yet.</em>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Card.Section>
      </Card>
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
    (line.reservations || []).forEach((res: any) => {
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
      (sum: number, res: any) => sum + (Number(res.qtyReserved) || 0),
      0
    );
  const remainingQty =
    line.availableQty != null
      ? Number(line.availableQty) || 0
      : Math.max(
          (Number(line.quantityOrdered || 0) || 0) -
            (Number(line.qtyReceived || 0) || 0) -
            reservedQty,
          0
        );
  const updateValue = (
    id: number,
    field: "qty" | "note",
    value: string
  ) => {
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

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Ordered {formatQty(line.quantityOrdered)} · Received{" "}
        {formatQty(line.qtyReceived)} · Reserved {formatQty(reservedQty)} ·
        Remaining {formatQty(remainingQty)}
      </Text>
      {fetcher.data?.error ? (
        <Text size="sm" c="red">
          {String(fetcher.data.error)}
        </Text>
      ) : null}
      {(line.reservations || []).length === 0 ? (
        <Text c="dimmed">No reservations yet.</Text>
      ) : (
        <Stack gap="sm">
          {(line.reservations || []).map((res: any) => {
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
                      >
                        Save
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        loading={isDeleting(res.id)}
                        onClick={() => handleDelete(res.id)}
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
      )}
    </Stack>
  );
}

function MovementDeleteMenu({
  movementId,
  poId,
  onDelete,
}: {
  movementId: number;
  poId: number;
  onDelete: (movementId: number) => void;
}) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="Movement actions">
          <IconMenu2 size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Receive Movement</Menu.Label>
        <Menu.Item
          leftSection={<IconTrash size={14} />}
          color="red"
          onClick={() => {
            modals.openConfirmModal({
              title: "Delete receive movement?",
              children: (
                <Text size="sm">
                  This will delete the movement header, lines, and any batches
                  that were created solely by this movement. It cannot be
                  undone.
                </Text>
              ),
              labels: { confirm: "Delete", cancel: "Cancel" },
              confirmProps: { color: "red" },
              onConfirm: () => onDelete(movementId),
            });
          }}
        >
          Delete Movement
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
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
                    <Table.Td>{opt.name}</Table.Td>
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
