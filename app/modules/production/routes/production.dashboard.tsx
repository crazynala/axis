import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  ActivityAction,
  ActivityKind,
  AssemblyStage,
  ExternalStepType,
} from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import {
  Link,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "@remix-run/react";
import {
  Badge,
  Button,
  Card,
  ActionIcon,
  Alert,
  Checkbox,
  Drawer,
  Modal,
  TextInput,
  NativeSelect,
  Select,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMemo, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { BreadcrumbSet } from "@aa/timber";
import { requireUserId } from "~/utils/auth.server";
import { useRegisterNavLocation } from "~/hooks/useNavLocation";
import { getDebugAccessForUser } from "~/modules/debug/debugAccess.server";
import type { CompanyOption } from "~/modules/company/components/CompanySelect";
import { loadSupplierOptionsByExternalStepTypes } from "~/modules/company/services/companyOptions.server";
import {
  fetchDashboardRows,
  type LoaderAssembly,
  type LoaderData,
} from "~/modules/production/services/production.dashboard.server";
import {
  buildProductionAttentionRows,
  type ProductionAttentionRow,
} from "~/modules/production/services/production.attention.server";
import {
  type ProductionAttentionFilters,
  type ProductionAttentionSort,
} from "~/modules/production/services/production.attention.logic";
import { MaterialCoverageDetails } from "~/modules/materials/components/MaterialCoverageDetails";
import type { AssemblyRiskSignals } from "~/modules/production/services/riskSignals.server";
import type { MaterialCoverageItem } from "~/modules/production/services/materialCoverage.server";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import { AxisChip } from "~/components/AxisChip";
import { OverrideIndicator } from "~/components/OverrideIndicator";
import { IconBug } from "@tabler/icons-react";
import {
  resolveExpectedQty,
  settleReservationsForAssemblyProduct,
  trimReservationsToExpected,
} from "~/modules/materials/services/reservations.server";

const LEAD_TIME_SOURCE_LABELS: Record<string, string> = {
  COSTING: "Costing",
  PRODUCT: "Product",
  COMPANY: "Vendor default",
};

type DashboardLoaderData = LoaderData & {
  canDebug: boolean;
  vendorOptionsByStep: Record<string, CompanyOption[]>;
  attentionRows: ProductionAttentionRow[];
  attentionFilters: ProductionAttentionFilters;
  attentionSort: ProductionAttentionSort;
};

export const meta: MetaFunction = () => [{ title: "Production Dashboard" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const attentionSort = parseAttentionSort(
    url.searchParams.get("attentionSort")
  );
  const attentionFilters = parseAttentionFilters(url.searchParams);
  const take =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.max(Math.floor(limitParam), 25), 50000)
      : 50000;
  const { loadDashboardData } = await import(
    "../services/production.dashboard.server"
  );
  const data = await loadDashboardData(take);
  const attentionRows = await buildProductionAttentionRows({
    assemblies: data.assemblies,
    filters: attentionFilters,
    sort: attentionSort,
    defaultLeadDays: data.defaultLeadDays,
  });
  const stepTypes = new Set<ExternalStepType>();
  (data.assemblies || []).forEach((assembly) => {
    (assembly.externalSteps || []).forEach((step) => {
      if (step?.type) stepTypes.add(step.type as ExternalStepType);
    });
  });
  const vendorOptionsByStep = await loadSupplierOptionsByExternalStepTypes(
    Array.from(stepTypes)
  );
  const debugAccess = await getDebugAccessForUser(userId);
  console.log("[production.dashboard.loader] assemblies", {
    take,
    count: Array.isArray(data.assemblies) ? data.assemblies.length : null,
    type: typeof data.assemblies,
    keys: data ? Object.keys(data || {}) : [],
    assembliesTag: data?.assemblies
      ? Object.prototype.toString.call(data.assemblies)
      : "none",
    assembliesKeys:
      data && data.assemblies && typeof data.assemblies === "object"
        ? Object.keys(data.assemblies as any)
        : [],
  });
  return json({
    ...data,
    attentionRows,
    attentionFilters,
    attentionSort,
    vendorOptionsByStep,
    canDebug: debugAccess.canDebug,
  });
}

export async function action({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "assignReservation") {
    const assemblyId = Number(form.get("assemblyId"));
    const productId = Number(form.get("productId"));
    const poLineId = Number(form.get("poLineId"));
    const qty = Number(form.get("qty"));
    if (
      !Number.isFinite(assemblyId) ||
      !Number.isFinite(productId) ||
      !Number.isFinite(poLineId) ||
      !Number.isFinite(qty) ||
      qty <= 0
    ) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const poLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: poLineId },
      select: {
        id: true,
        productId: true,
        qtyReceived: true,
        quantityOrdered: true,
        quantity: true,
      },
    });
    if (!poLine) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    if (poLine.productId && poLine.productId !== productId) {
      return json({ ok: false, error: "product_mismatch" }, { status: 400 });
    }
    const qtyExpected = resolveExpectedQty(poLine);
    const qtyReceived = Number(poLine.qtyReceived ?? 0) || 0;
    const reservedTotals = await prisma.supplyReservation.aggregate({
      _sum: { qtyReserved: true },
      where: { purchaseOrderLineId: poLineId, settledAt: null },
    });
    const existingReserved =
      Number(reservedTotals._sum.qtyReserved ?? 0) || 0;
    const remaining = Math.max(
      qtyExpected - qtyReceived - existingReserved,
      0
    );
    if (!(remaining > 0)) {
      return json({ ok: false, error: "no_remaining" }, { status: 400 });
    }
    const reserveQty = Math.min(qty, remaining);
    if (!(reserveQty > 0)) {
      return json({ ok: false, error: "invalid_qty" }, { status: 400 });
    }
    await prisma.supplyReservation.create({
      data: {
        assemblyId,
        productId,
        purchaseOrderLineId: poLineId,
        qtyReserved: reserveQty,
      },
    });
    return json({ ok: true });
  }
  if (
    intent === "externalStep.batchSend" ||
    intent === "externalStep.batchReceive"
  ) {
    const itemsRaw = String(form.get("items") || "[]");
    let items: Array<{
      assemblyId: number;
      externalStepType: string | null;
      qty: number;
      qtyBreakdown: number[];
    }> = [];
    try {
      const parsed = JSON.parse(itemsRaw);
      if (Array.isArray(parsed)) {
        items = parsed
          .map((item) => ({
            assemblyId: Number(item?.assemblyId),
            externalStepType:
              typeof item?.externalStepType === "string"
                ? item.externalStepType
                : null,
            qty: Number(item?.qty ?? 0),
            qtyBreakdown: Array.isArray(item?.qtyBreakdown)
              ? item.qtyBreakdown.map((n: any) =>
                  Number.isFinite(Number(n)) && Number(n) > 0
                    ? Number(n)
                    : 0
                )
              : [],
          }))
          .filter((item) => Number.isFinite(item.assemblyId));
      }
    } catch {
      items = [];
    }
    if (!items.length) {
      return json({ ok: false, error: "missing_items" }, { status: 400 });
    }
    const vendorCompanyIdRaw = Number(form.get("vendorCompanyId") ?? NaN);
    const vendorCompanyId = Number.isFinite(vendorCompanyIdRaw)
      ? vendorCompanyIdRaw
      : null;
    const vendorUnknown = String(form.get("vendorUnknown") || "") === "1";
    if (!vendorCompanyId && !vendorUnknown) {
      return json({ ok: false, error: "vendor_required" }, { status: 400 });
    }
    const activityDateRaw = String(form.get("activityDate") || "");
    const activityDate = activityDateRaw
      ? new Date(activityDateRaw)
      : new Date();
    const action =
      intent === "externalStep.batchSend"
        ? ActivityAction.SENT_OUT
        : ActivityAction.RECEIVED_IN;
    const recordSewNow =
      action === ActivityAction.SENT_OUT &&
      String(form.get("recordSewNow") || "") === "1" &&
      items.length === 1;

    const assemblyIds = Array.from(
      new Set(items.map((item) => item.assemblyId))
    );
    const assemblies = await prisma.assembly.findMany({
      where: { id: { in: assemblyIds } },
      select: { id: true, jobId: true },
    });
    const jobIdByAssembly = new Map<number, number | null>();
    assemblies.forEach((assembly) => {
      jobIdByAssembly.set(assembly.id, assembly.jobId ?? null);
    });
    const expectedMap = new Map<number, Set<ExternalStepType>>();
    const expectedCostings = await prisma.costing.findMany({
      where: {
        assemblyId: { in: assemblyIds },
        externalStepType: { not: null },
      },
      select: { assemblyId: true, externalStepType: true },
    });
    expectedCostings.forEach((row) => {
      if (!row.assemblyId || !row.externalStepType) return;
      const set = expectedMap.get(row.assemblyId) ?? new Set();
      set.add(row.externalStepType);
      expectedMap.set(row.assemblyId, set);
    });
    const expectedActivities = await prisma.assemblyActivity.findMany({
      where: {
        assemblyId: { in: assemblyIds },
        externalStepType: { not: null },
      },
      select: { assemblyId: true, externalStepType: true },
    });
    expectedActivities.forEach((row) => {
      if (!row.assemblyId || !row.externalStepType) return;
      const set = expectedMap.get(row.assemblyId) ?? new Set();
      set.add(row.externalStepType);
      expectedMap.set(row.assemblyId, set);
    });

    let created = 0;
    let skipped = 0;
    let skippedMissingStep = 0;
    for (const item of items) {
      const externalStepTypeRaw = item.externalStepType;
      const externalStepType = Object.values(ExternalStepType).includes(
        externalStepTypeRaw as ExternalStepType
      )
        ? (externalStepTypeRaw as ExternalStepType)
        : null;
      const qtyBreakdown =
        item.qtyBreakdown && item.qtyBreakdown.length
          ? item.qtyBreakdown
          : [];
      const qty = qtyBreakdown.reduce((sum, value) => sum + value, 0);
      // qtyBreakdown is mandatory for any unit-moving external step.
      if (!externalStepType || qty <= 0 || !qtyBreakdown.length) {
        skipped += 1;
        continue;
      }
      const expected = expectedMap.get(item.assemblyId);
      if (!expected || !expected.has(externalStepType)) {
        skippedMissingStep += 1;
        continue;
      }
      const jobId = jobIdByAssembly.get(item.assemblyId) ?? null;
      await prisma.assemblyActivity.create({
        data: {
          assemblyId: item.assemblyId,
          jobId: jobId ?? undefined,
          stage: AssemblyStage.finish,
          kind: ActivityKind.normal,
          action,
          externalStepType,
          vendorCompanyId: vendorCompanyId ?? undefined,
          activityDate,
          quantity: qty,
          qtyBreakdown,
          notes: vendorUnknown ? "Unknown vendor selected" : null,
        },
      });
      if (recordSewNow) {
        await prisma.assemblyActivity.create({
          data: {
            assemblyId: item.assemblyId,
            jobId: jobId ?? undefined,
            name: "Sew",
            stage: AssemblyStage.sew,
            kind: ActivityKind.normal,
            action: ActivityAction.RECORDED,
            activityDate,
            quantity: qty,
            qtyBreakdown,
            notes: "Recorded from Send Out helper",
          },
        });
      }
      created += 1;
    }

    return json({
      ok: true,
      created,
      skipped,
      skippedMissingStep,
    });
  }
  if (intent === "acceptGap") {
    const assemblyId = Number(form.get("assemblyId"));
    const productId = Number(form.get("productId"));
    if (!Number.isFinite(assemblyId) || !Number.isFinite(productId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const rows = await fetchDashboardRows([assemblyId]);
    const assembly = rows[0];
    if (!assembly?.materialCoverage) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    const material = assembly.materialCoverage.materials.find(
      (m) => m.productId === productId
    );
    if (!material) {
      return json({ ok: false, error: "material_missing" }, { status: 404 });
    }
    const uncovered = Number(material.qtyUncovered ?? 0) || 0;
    if (!(uncovered > 0)) {
      return json({ ok: false, error: "no_gap" }, { status: 400 });
    }
    const priorAbs =
      assembly.materialCoverageToleranceAbs != null
        ? Number(assembly.materialCoverageToleranceAbs)
        : null;
    const nextAbs = Math.max(priorAbs ?? 0, uncovered);
    const actor = await resolveUserLabel(userId);
    const productLabel =
      material.productName ?? `product ${material.productId ?? productId}`;
    const noteParts = [
      `Accepted coverage gap for ${productLabel} (#${productId})`,
      `raw gap ${formatNumber(uncovered)}`,
      `abs ${formatNumber(priorAbs)} → ${formatNumber(nextAbs)}`,
    ];
    await prisma.$transaction([
      prisma.assembly.update({
        where: { id: assemblyId },
        data: { materialCoverageToleranceAbs: nextAbs },
      }),
      prisma.assemblyActivity.create({
        data: {
          assemblyId,
          jobId: assembly.job?.id ?? null,
          stage: AssemblyStage.order,
          action: ActivityAction.NOTE,
          kind: ActivityKind.normal,
          activityDate: new Date(),
          notes: noteParts.join(" • "),
          createdBy: actor,
        },
      }),
    ]);
    return json({ ok: true });
  }
  if (intent === "updateTolerance") {
    const assemblyId = Number(form.get("assemblyId"));
    const reset = form.get("reset") === "1";
    if (!Number.isFinite(assemblyId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const pctRaw = form.get("pct");
    const absRaw = form.get("abs");
    const pctVal =
      !reset && pctRaw != null && pctRaw !== ""
        ? Number(pctRaw)
        : null;
    const absVal =
      !reset && absRaw != null && absRaw !== ""
        ? Number(absRaw)
        : null;
    await prisma.assembly.update({
      where: { id: assemblyId },
      data: {
        materialCoverageTolerancePct:
          pctVal != null && Number.isFinite(pctVal) && pctVal >= 0
            ? pctVal
            : null,
        materialCoverageToleranceAbs:
          absVal != null && Number.isFinite(absVal) && absVal >= 0
            ? absVal
            : null,
      },
    });
    return json({ ok: true });
  }
  if (intent === "reservations.trim") {
    const lineId = Number(form.get("lineId"));
    const noteRaw = form.get("note");
    if (!Number.isFinite(lineId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const trimmed = await trimReservationsToExpected({
      purchaseOrderLineId: lineId,
      userId,
      note: typeof noteRaw === "string" ? noteRaw : null,
    });
    if (!trimmed) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    return json({ ok: true, trimmed: trimmed.trimmed });
  }
  if (intent === "reservations.settle") {
    const assemblyId = Number(form.get("assemblyId"));
    const productId = Number(form.get("productId"));
    const noteRaw = form.get("note");
    if (!Number.isFinite(assemblyId) || !Number.isFinite(productId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const rows = await fetchDashboardRows([assemblyId]);
    const assembly = rows[0];
    const material = assembly?.materialCoverage?.materials.find(
      (m) => m.productId === productId
    );
    if (!material) {
      return json({ ok: false, error: "material_missing" }, { status: 404 });
    }
    if ((material.qtyRequired ?? 0) > 0) {
      return json(
        { ok: false, error: "requires_settle" },
        { status: 400 }
      );
    }
    await settleReservationsForAssemblyProduct({
      assemblyId,
      productId,
      userId,
      note: typeof noteRaw === "string" ? noteRaw : null,
    });
    return json({ ok: true });
  }
  return json({ ok: false }, { status: 400 });
}

export default function ProductionDashboardRoute() {
  const data = useLoaderData<DashboardLoaderData>();
  const assemblies = Array.isArray(data?.assemblies)
    ? (data.assemblies as LoaderAssembly[])
    : [];
  const attentionRows = Array.isArray(data?.attentionRows)
    ? (data.attentionRows as ProductionAttentionRow[])
    : [];
  const attentionFilters = data.attentionFilters;
  const attentionSort = data.attentionSort;
  console.log("[production.dashboard] client data", {
    assemblies: assemblies.length,
    type: typeof data?.assemblies,
  });
  const [activeTab, setActiveTab] = useState<string>("at-risk");
  const [searchParams, setSearchParams] = useSearchParams();
  const [poHoldFocus, setPoHoldFocus] = useState<LoaderAssembly | null>(null);
  const [debugTarget, setDebugTarget] = useState<LoaderAssembly | null>(null);
  const [assignTarget, setAssignTarget] = useState<{
    assembly: LoaderAssembly;
    productId: number;
    productName: string | null;
    uncovered: number;
  } | null>(null);
  const assignFetcher = useFetcher();
  const acceptGapFetcher = useFetcher();
  const toleranceFetcher = useFetcher();
  const reservationFetcher = useFetcher();
  const debugFetcher = useFetcher();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const canDebug = Boolean(data?.canDebug);
  const vendorOptionsByStep = data.vendorOptionsByStep || {};

  useEffect(() => {
    if (
      (assignFetcher.state === "idle" && assignFetcher.data) ||
      (acceptGapFetcher.state === "idle" && acceptGapFetcher.data) ||
      (toleranceFetcher.state === "idle" && toleranceFetcher.data) ||
      (reservationFetcher.state === "idle" && reservationFetcher.data)
    ) {
      revalidator.revalidate();
    }
  }, [
    assignFetcher.state,
    assignFetcher.data,
    acceptGapFetcher.state,
    acceptGapFetcher.data,
    toleranceFetcher.state,
    toleranceFetcher.data,
    reservationFetcher.state,
    reservationFetcher.data,
    revalidator,
  ]);
  useRegisterNavLocation({ moduleKey: "production-dashboard" });
  const toleranceDefaults = data.toleranceDefaults;

  const handleAssignSubmit = useCallback(
    (lineId: number, qty: number) => {
      if (!assignTarget) return;
      const fd = new FormData();
      fd.set("_intent", "assignReservation");
      fd.set("assemblyId", String(assignTarget.assembly.id));
      fd.set("productId", String(assignTarget.productId));
      fd.set("poLineId", String(lineId));
      fd.set("qty", String(qty));
      assignFetcher.submit(fd, { method: "post" });
    },
    [assignFetcher, assignTarget]
  );

  useEffect(() => {
    if (assignFetcher.state === "idle" && assignFetcher.data) {
      setAssignTarget(null);
      navigate(0);
    }
  }, [assignFetcher.state, assignFetcher.data, navigate]);
  useEffect(() => {
    if (
      (acceptGapFetcher.state === "idle" && acceptGapFetcher.data) ||
      (toleranceFetcher.state === "idle" && toleranceFetcher.data)
    ) {
      navigate(0);
    }
  }, [
    acceptGapFetcher.state,
    acceptGapFetcher.data,
    toleranceFetcher.state,
    toleranceFetcher.data,
    navigate,
  ]);

  const handleAcceptGap = useCallback(
    (assemblyId: number, productId: number) => {
      const fd = new FormData();
      fd.set("_intent", "acceptGap");
      fd.set("assemblyId", String(assemblyId));
      fd.set("productId", String(productId));
      acceptGapFetcher.submit(fd, { method: "post" });
    },
    [acceptGapFetcher]
  );

  const handleToleranceSave = useCallback(
    (assemblyId: number, abs: number | null, pct: number | null) => {
      const fd = new FormData();
      fd.set("_intent", "updateTolerance");
      fd.set("assemblyId", String(assemblyId));
      if (pct != null && Number.isFinite(pct)) {
        fd.set("pct", String(pct));
      }
      if (abs != null && Number.isFinite(abs)) {
        fd.set("abs", String(abs));
      }
      toleranceFetcher.submit(fd, { method: "post" });
    },
    [toleranceFetcher]
  );

  const handleToleranceReset = useCallback(
    (assemblyId: number) => {
      const fd = new FormData();
      fd.set("_intent", "updateTolerance");
      fd.set("assemblyId", String(assemblyId));
      fd.set("reset", "1");
      toleranceFetcher.submit(fd, { method: "post" });
    },
    [toleranceFetcher]
  );
  const handleTrimReservations = useCallback(
    (lineId: number) => {
      const fd = new FormData();
      fd.set("_intent", "reservations.trim");
      fd.set("lineId", String(lineId));
      reservationFetcher.submit(fd, { method: "post" });
    },
    [reservationFetcher]
  );
  const handleSettleReservations = useCallback(
    (assemblyId: number, productId: number, note: string | null) => {
      const fd = new FormData();
      fd.set("_intent", "reservations.settle");
      fd.set("assemblyId", String(assemblyId));
      fd.set("productId", String(productId));
      if (note) {
        fd.set("note", note);
      }
      reservationFetcher.submit(fd, { method: "post" });
    },
    [reservationFetcher]
  );
  const handleOpenDebug = useCallback(
    (assembly: LoaderAssembly) => {
      setDebugTarget(assembly);
      debugFetcher.load(
        `/production/dashboard/debug?assemblyId=${assembly.id}`
      );
    },
    [debugFetcher]
  );
  const acceptGapTargetProductId =
    acceptGapFetcher.state !== "idle"
      ? Number(acceptGapFetcher.formData?.get("productId"))
      : null;
  const reservationIntent =
    reservationFetcher.state !== "idle"
      ? String(reservationFetcher.formData?.get("_intent") || "")
      : "";
  const trimCandidate =
    reservationIntent === "reservations.trim"
      ? Number(reservationFetcher.formData?.get("lineId"))
      : NaN;
  const settleCandidate =
    reservationIntent === "reservations.settle"
      ? Number(reservationFetcher.formData?.get("productId"))
      : NaN;
  const trimmingLineId = Number.isFinite(trimCandidate) ? trimCandidate : null;
  const settlingProductId = Number.isFinite(settleCandidate)
    ? settleCandidate
    : null;
  const [selectedAtRisk, setSelectedAtRisk] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedVendorRows, setSelectedVendorRows] = useState<Set<string>>(
    () => new Set()
  );
  const [batchAction, setBatchAction] = useState<{
    mode: "send" | "receive";
    rows: Array<{
      key: string;
      assemblyId: number;
      assemblyLabel: string;
      stepType: string | null;
      stepLabel: string | null;
      qtyDefault: number;
      expectedTypes: string[];
      sewMissing: boolean;
      variantLabels: string[];
      qtyBreakdown: number[];
    }>;
    availableStepTypes: Array<{ value: string; label: string }>;
    selectedStepType: string | null;
    recordSewNow: boolean;
  } | null>(null);
  const [batchVendorId, setBatchVendorId] = useState<number | null>(null);
  const [batchUnknownVendor, setBatchUnknownVendor] = useState(false);
  const [batchDate, setBatchDate] = useState<Date | null>(new Date());
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchFetcher = useFetcher<{
    ok?: boolean;
    created?: number;
    skipped?: number;
    skippedMissingStep?: number;
    error?: string;
  }>();

  const supplySummaryByAssembly = useMemo(() => {
    const map = new Map<number, SupplySummary>();
    assemblies.forEach((assembly) => {
      map.set(
        assembly.id,
        summarizeCoverage(assembly.materialCoverage)
      );
    });
    return map;
  }, [assemblies]);

  useEffect(() => {
    if (batchFetcher.data?.ok) {
      setBatchError(null);
      revalidator.revalidate();
      setSelectedAtRisk(new Set());
      setSelectedVendorRows(new Set());
    } else if (batchFetcher.data?.error) {
      setBatchError(String(batchFetcher.data.error));
    }
  }, [batchFetcher.data, revalidator]);

  const assembliesById = useMemo(() => {
    const map = new Map<number, LoaderAssembly>();
    assemblies.forEach((assembly) => map.set(assembly.id, assembly));
    return map;
  }, [assemblies]);

  const atRiskRows = useMemo(() => {
    return attentionRows
      .map((row) => ({
        attention: row,
        assembly: assembliesById.get(row.assemblyId) || null,
      }))
      .filter((row) => Boolean(row.assembly));
  }, [attentionRows, assembliesById]);

  const vendorRows = useMemo(() => {
    return assemblies
      .flatMap((assembly) =>
        (assembly.externalSteps || [])
          .filter((step) => step.status === "IN_PROGRESS")
          .map((step) => ({
            assembly,
            step,
          }))
      )
      .sort((a, b) => {
        const aTime = stepTime(a.step.etaDate);
        const bTime = stepTime(b.step.etaDate);
        if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
          return aTime - bTime;
        }
        if (Number.isFinite(aTime)) return -1;
        if (Number.isFinite(bTime)) return 1;
        return a.assembly.id - b.assembly.id;
      });
  }, [assemblies]);

  const nextActionRows = useMemo(() => {
    const priority: Record<string, number> = {
      FOLLOW_UP_VENDOR: 0,
      RESOLVE_PO: 1,
      SEND_OUT: 2,
    };
    return assemblies
      .flatMap((assembly) =>
        assembly.risk.nextActions.map((action) => ({
          assembly,
          action,
        }))
      )
      .sort((a, b) => {
        const aRank = priority[a.action.kind] ?? 99;
        const bRank = priority[b.action.kind] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        return a.assembly.id - b.assembly.id;
      });
  }, [assemblies]);

  const materialsShortRows = useMemo(() => {
    return assemblies
      .flatMap((assembly) =>
        (assembly.materialCoverage?.materials || [])
          .filter((material) => (material.qtyUncovered ?? 0) > 0)
          .map((material) => ({
            assembly,
            material,
            summary: summarizeMaterials([material]),
          }))
      )
      .sort((a, b) => {
        const rankDiff = a.summary.rank - b.summary.rank;
        if (rankDiff !== 0) return rankDiff;
        const diff =
          (b.material.qtyUncovered ?? 0) - (a.material.qtyUncovered ?? 0);
        if (diff !== 0) return diff;
        return a.assembly.id - b.assembly.id;
      });
  }, [assemblies]);

  const vendorSelectData = useMemo(() => {
    if (!batchAction) return [];
    const baseTypes = batchAction.selectedStepType
      ? [batchAction.selectedStepType]
      : batchAction.availableStepTypes.map((type) => type.value);
    const map = new Map<number, CompanyOption>();
    baseTypes.forEach((type) => {
      (vendorOptionsByStep[type] || []).forEach((opt) => {
        if (!map.has(opt.value)) map.set(opt.value, opt);
      });
    });
    if (batchVendorId && !map.has(batchVendorId)) {
      map.set(batchVendorId, {
        value: batchVendorId,
        label: `Company ${batchVendorId}`,
        isSupplier: true,
      });
    }
    return Array.from(map.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((opt) => ({ value: String(opt.value), label: opt.label }));
  }, [batchAction, batchVendorId, vendorOptionsByStep]);

  const openBatchModal = (opts: {
    mode: "send" | "receive";
    vendorId?: number | null;
    rows: Array<{
      key: string;
      assemblyId: number;
      assemblyLabel: string;
      stepType: string | null;
      stepLabel: string | null;
      qtyDefault: number;
      expectedTypes: string[];
      sewMissing: boolean;
      variantLabels: string[];
      qtyBreakdown: number[];
    }>;
  }) => {
    const stepLabelByType = new Map<string, string>();
    opts.rows.forEach((row) => {
      row.expectedTypes.forEach((type) => {
        if (!stepLabelByType.has(type) && row.stepLabel) {
          stepLabelByType.set(type, row.stepLabel);
        }
      });
    });
    const availableStepTypes = Array.from(
      new Set(opts.rows.flatMap((row) => row.expectedTypes))
    ).map((type) => ({
      value: type,
      label: stepLabelByType.get(type) ?? type,
    }));
    const commonTypes = opts.rows.reduce<Set<string> | null>((acc, row) => {
      const set = new Set(row.expectedTypes);
      if (!acc) return set;
      const next = new Set<string>();
      acc.forEach((val) => {
        if (set.has(val)) next.add(val);
      });
      return next;
    }, null);
    const selectedStepType =
      commonTypes && commonTypes.size === 1
        ? Array.from(commonTypes)[0]
        : null;

    setBatchAction({
      mode: opts.mode,
      rows: opts.rows,
      availableStepTypes,
      selectedStepType,
      recordSewNow: false,
    });
    setBatchVendorId(opts.vendorId ?? null);
    setBatchUnknownVendor(false);
    setBatchDate(new Date());
    setBatchError(null);
  };

  const updateAttentionParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (value === null) next.delete(key);
      else next.set(key, value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleAttentionSortChange = useCallback(
    (value: string | null) => {
      updateAttentionParam(
        "attentionSort",
        value && value !== "priority" ? value : null
      );
    },
    [updateAttentionParam]
  );

  const handleIncludeHeldChange = useCallback(
    (checked: boolean) => {
      updateAttentionParam("includeHeld", checked ? null : "0");
    },
    [updateAttentionParam]
  );

  const handleOnlyNotStartedChange = useCallback(
    (checked: boolean) => {
      updateAttentionParam("onlyNotStarted", checked ? "1" : null);
    },
    [updateAttentionParam]
  );

  const handleOnlyDueSoonChange = useCallback(
    (checked: boolean) => {
      updateAttentionParam("onlyDueSoon", checked ? "1" : null);
    },
    [updateAttentionParam]
  );

  const handleOnlyBlockedChange = useCallback(
    (checked: boolean) => {
      updateAttentionParam("onlyBlocked", checked ? "1" : null);
    },
    [updateAttentionParam]
  );

  const openBatchSendFromAtRisk = (rows: LoaderAssembly[]) => {
    const nextRows = rows.map((assembly) => {
      const expectedSteps = (assembly.externalSteps || [])
        .filter((step) => step.expected)
        .map((step) => ({
          type: step.type,
          label: step.label,
        }));
      const expectedTypes = expectedSteps.map((step) => step.type);
      const defaultQty = Number(assembly.rollup?.sewnAvailableQty ?? 0) || 0;
      const variantLabels =
        (assembly.variantLabels && assembly.variantLabels.length
          ? assembly.variantLabels
          : ["Qty"]) ?? ["Qty"];
      const qtyBreakdown =
        variantLabels.length === 1
          ? [defaultQty]
          : Array.from({ length: variantLabels.length }, () => 0);
      return {
        key: `asm-${assembly.id}`,
        assemblyId: assembly.id,
        assemblyLabel: `A${assembly.id}`,
        stepType: null,
        stepLabel: expectedSteps[0]?.label ?? null,
        qtyDefault: defaultQty,
        expectedTypes,
        sewMissing: (Number(assembly.rollup?.sewGoodQty ?? 0) || 0) <= 0,
        variantLabels,
        qtyBreakdown,
      };
    });
    openBatchModal({ mode: "send", rows: nextRows });
  };

  const openBatchReceiveFromVendor = (
    rows: Array<{ assembly: LoaderAssembly; step: any }>
  ) => {
    const vendorIds = rows
      .map(({ step }) => step.vendor?.id ?? null)
      .filter((id): id is number => Boolean(id));
    const sharedVendorId =
      vendorIds.length > 0 && vendorIds.every((id) => id === vendorIds[0])
        ? vendorIds[0]
        : null;
    const nextRows = rows.map(({ assembly, step }) => {
      const defaultQty = Math.max(
        (Number(step.qtyOut ?? 0) || 0) - (Number(step.qtyIn ?? 0) || 0),
        0
      );
      const variantLabels =
        (assembly.variantLabels && assembly.variantLabels.length
          ? assembly.variantLabels
          : ["Qty"]) ?? ["Qty"];
      const qtyBreakdown =
        variantLabels.length === 1
          ? [defaultQty]
          : Array.from({ length: variantLabels.length }, () => 0);
      return {
        key: `asm-${assembly.id}-${step.type}`,
        assemblyId: assembly.id,
        assemblyLabel: `A${assembly.id}`,
        stepType: step.type,
        stepLabel: step.label ?? null,
        qtyDefault: defaultQty,
        expectedTypes: [step.type],
        sewMissing: false,
        variantLabels,
        qtyBreakdown,
      };
    });
    openBatchModal({ mode: "receive", rows: nextRows, vendorId: sharedVendorId });
  };

  const handleBatchSubmit = () => {
    if (!batchAction) return;
    if (
      batchAction.mode === "send" &&
      !batchAction.selectedStepType
    ) {
      setBatchError("Select a step type for this batch.");
      return;
    }
    if (!batchUnknownVendor && !batchVendorId) {
      setBatchError("Vendor is required (or choose Unknown vendor).");
      return;
    }
    const activityDate = batchDate ?? new Date();
    const items = batchAction.rows.map((row) => {
      const breakdown = (row.qtyBreakdown || []).map((value) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : 0;
      });
      const qty = breakdown.reduce((sum, value) => sum + value, 0);
      return {
        assemblyId: row.assemblyId,
        externalStepType: batchAction.selectedStepType || row.stepType,
        qty,
        qtyBreakdown: breakdown,
      };
    });
    if (items.some((item) => item.qty <= 0)) {
      setBatchError("Enter size breakdowns for all rows.");
      return;
    }
    const fd = new FormData();
    fd.set(
      "_intent",
      batchAction.mode === "send"
        ? "externalStep.batchSend"
        : "externalStep.batchReceive"
    );
    fd.set("items", JSON.stringify(items));
    fd.set("activityDate", activityDate.toISOString());
    if (batchVendorId) fd.set("vendorCompanyId", String(batchVendorId));
    if (batchUnknownVendor) fd.set("vendorUnknown", "1");
    if (batchAction.mode === "send" && batchAction.recordSewNow) {
      fd.set("recordSewNow", "1");
    }
    batchFetcher.submit(fd, { method: "post" });
  };

  const handleBatchRowBreakdownChange = (
    rowKey: string,
    index: number,
    value: string
  ) => {
    const parsed = value === "" ? 0 : Number(value);
    const sanitized =
      Number.isFinite(parsed) && parsed > 0 ? Number(parsed) : 0;
    setBatchAction((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((row) => {
        if (row.key !== rowKey) return row;
        const next = [...(row.qtyBreakdown || [])];
        next[index] = sanitized;
        return { ...row, qtyBreakdown: next };
      });
      return { ...prev, rows: nextRows };
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Production Dashboard", href: "/production/dashboard" },
          ]}
        />
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Updated {formatDateTime(data.asOf)}
          </Text>
          <Button size="xs" variant="default" onClick={() => navigate(0)}>
            Refresh
          </Button>
        </Group>
      </Group>
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || "at-risk")}
      >
        <Tabs.List>
          <Tabs.Tab value="at-risk">At Risk</Tabs.Tab>
          <Tabs.Tab value="vendor">Out at Vendor</Tabs.Tab>
          <Tabs.Tab value="actions">Needs Action</Tabs.Tab>
          <Tabs.Tab value="materials">Materials Short</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="at-risk" pt="md">
          <Card withBorder padding="md">
            <Group justify="space-between" mb="sm" align="center">
              <Group gap="xs" wrap="wrap">
                <Checkbox
                  label="Include held"
                  checked={attentionFilters?.includeHeld ?? true}
                  onChange={(e) =>
                    handleIncludeHeldChange(e.currentTarget.checked)
                  }
                />
                <Checkbox
                  label="Only not started"
                  checked={attentionFilters?.onlyNotStarted ?? false}
                  onChange={(e) =>
                    handleOnlyNotStartedChange(e.currentTarget.checked)
                  }
                />
                <Checkbox
                  label="Only due soon/late"
                  checked={attentionFilters?.onlyDueSoon ?? false}
                  onChange={(e) =>
                    handleOnlyDueSoonChange(e.currentTarget.checked)
                  }
                />
                <Checkbox
                  label="Only blocked"
                  checked={attentionFilters?.onlyBlocked ?? false}
                  onChange={(e) =>
                    handleOnlyBlockedChange(e.currentTarget.checked)
                  }
                />
              </Group>
              <Select
                label="Sort"
                value={attentionSort || "priority"}
                data={[
                  { value: "priority", label: "Priority" },
                  { value: "deadline", label: "Nearest deadline" },
                  { value: "customer", label: "Customer" },
                  { value: "job", label: "Job code" },
                  { value: "assembly", label: "Assembly id" },
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                ]}
                onChange={handleAttentionSortChange}
                size="xs"
                w={200}
              />
            </Group>
            {selectedAtRisk.size > 0 ? (
              <Group justify="space-between" mb="sm">
                <Text size="sm">
                  {selectedAtRisk.size} selected
                </Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      openBatchSendFromAtRisk(
                        atRiskRows
                          .filter((row) =>
                            selectedAtRisk.has(row.attention.assemblyId)
                          )
                          .map((row) => row.assembly)
                          .filter(Boolean)
                      )
                    }
                  >
                    Batch Send Out
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      openBatchModal({
                        mode: "receive",
                        rows: atRiskRows
                          .filter((row) =>
                            selectedAtRisk.has(row.attention.assemblyId)
                          )
                          .map((row) => row.assembly)
                          .filter(Boolean)
                          .map((row) => {
                            const step = (row.externalSteps || []).find(
                              (s) => s.status === "IN_PROGRESS"
                            );
                            const defaultQty = step
                              ? Math.max(
                                  (Number(step.qtyOut ?? 0) || 0) -
                                    (Number(step.qtyIn ?? 0) || 0),
                                  0
                                )
                              : 0;
                            return {
                              key: `asm-${row.id}-${step?.type ?? "none"}`,
                              assemblyId: row.id,
                              assemblyLabel: `A${row.id}`,
                              stepType: step?.type ?? null,
                              stepLabel: step?.label ?? null,
                              qty: defaultQty,
                              qtyDefault: defaultQty,
                              expectedTypes: step?.type ? [step.type] : [],
                              sewMissing: false,
                            };
                          }),
                      })
                    }
                  >
                    Batch Receive In
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => setSelectedAtRisk(new Set())}
                  >
                    Clear
                  </Button>
                </Group>
              </Group>
            ) : null}
            <Table
              striped
              highlightOnHover
              verticalSpacing="xs"
              horizontalSpacing="md"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36}>
                    <Checkbox
                      aria-label="Select all"
                      checked={
                        atRiskRows.length > 0 &&
                        selectedAtRisk.size === atRiskRows.length
                      }
                      indeterminate={
                        selectedAtRisk.size > 0 &&
                        selectedAtRisk.size < atRiskRows.length
                      }
                      onChange={(e) => {
                        if (e.currentTarget.checked) {
                          setSelectedAtRisk(
                            new Set(
                              atRiskRows.map((row) => row.attention.assemblyId)
                            )
                          );
                        } else {
                          setSelectedAtRisk(new Set());
                        }
                      }}
                    />
                  </Table.Th>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Work</Table.Th>
                  <Table.Th>Signals</Table.Th>
                  <Table.Th>External step</Table.Th>
                  <Table.Th>External ETA</Table.Th>
                  <Table.Th>Supply</Table.Th>
                  <Table.Th>PO ETA</Table.Th>
                  <Table.Th>Target date</Table.Th>
                  <Table.Th>Ready to pack</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {atRiskRows.map((row) => {
                  const assembly = row.assembly;
                  if (!assembly) return null;
                  const supplySummary =
                    supplySummaryByAssembly.get(assembly.id) ??
                    emptySupplySummary();
                  const supplyChips = buildSupplyChips(supplySummary, {
                    showCounts: true,
                  });
                  const nextSendStep = (assembly.externalSteps || []).find(
                    (step) => step.expected && step.status === "NOT_STARTED"
                  );
                  const nextReceiveStep = (assembly.externalSteps || []).find(
                    (step) => step.status === "IN_PROGRESS"
                  );
                  const dateValue =
                    row.attention.dropDeadDate ||
                    row.attention.customerTargetDate ||
                    row.attention.internalTargetDate ||
                    null;
                  const dateSource = row.attention.dropDeadDate
                    ? row.attention.dropDeadSource
                    : row.attention.customerTargetDate
                      ? row.attention.customerTargetSource
                      : row.attention.internalTargetDate
                        ? row.attention.internalTargetSource
                        : "NONE";
                  const jobDateValue = row.attention.dropDeadDate
                    ? row.attention.dropDeadJobValue
                    : row.attention.customerTargetDate
                      ? row.attention.customerTargetJobValue
                      : row.attention.internalTargetDate
                        ? row.attention.internalTargetJobValue
                        : null;
                  const dateTooltip =
                    dateSource === "OVERRIDE"
                      ? `Pinned. Effective: ${formatDate(dateValue)} · Job: ${formatDate(jobDateValue)}`
                      : dateSource === "DERIVED"
                        ? "Derived internal target date"
                        : "";
                  const isSelected = selectedAtRisk.has(
                    row.attention.assemblyId
                  );
                  return (
                    <Table.Tr key={row.attention.assemblyId}>
                    <Table.Td>
                      <Checkbox
                        aria-label={`Select A${row.attention.assemblyId}`}
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedAtRisk((prev) => {
                            const next = new Set(prev);
                            if (e.currentTarget.checked)
                              next.add(row.attention.assemblyId);
                            else next.delete(row.attention.assemblyId);
                            return next;
                          });
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        {row.attention.jobId ? (
                          <Link
                            to={`/jobs/${row.attention.jobId}/assembly/${row.attention.assemblyId}`}
                          >
                            A{row.attention.assemblyId}
                          </Link>
                        ) : (
                          <Text fw={600}>A{row.attention.assemblyId}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {row.attention.assemblyName ||
                            row.attention.productName ||
                            "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link to={`/jobs/${assembly.job.id}`}>
                            {formatJobLabel(assembly.job)}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <Text size="xs" c="dimmed">
                          {row.attention.customerName || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="xs">
                          Net {formatQuantity(row.attention.effectiveOrderedTotal)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Cut {formatQuantity(row.attention.cutTotal)} · Finish{" "}
                          {formatQuantity(row.attention.finishTotal)} · Pack{" "}
                          {formatQuantity(row.attention.packTotal)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="wrap">
                        {collapseAttentionSignals(
                          row.attention.attentionSignals,
                          4
                        ).map((signal) => (
                          <Tooltip
                            key={`${row.attention.assemblyId}-${signal.key}`}
                            label={signal.tooltip}
                            disabled={!signal.tooltip}
                            multiline
                          >
                            <AxisChip tone={signal.tone}>{signal.label}</AxisChip>
                          </Tooltip>
                        ))}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        {renderExternalStatus(assembly.risk)}
                        <Text size="xs" c="dimmed">
                          {assembly.risk.externalEtaStepLabel || "—"}
                        </Text>
                        {(nextSendStep || nextReceiveStep) ? (
                          <Group gap="xs">
                            {nextSendStep ? (
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() =>
                                  openBatchModal({
                                    mode: "send",
                                    vendorId: nextSendStep.vendor?.id ?? null,
                                    rows: [
                                      {
                                        key: `asm-${assembly.id}`,
                                        assemblyId: assembly.id,
                                        assemblyLabel: `A${assembly.id}`,
                                        stepType: nextSendStep.type,
                                        stepLabel: nextSendStep.label,
                                        qty: Number(
                                          assembly.rollup?.sewnAvailableQty ?? 0
                                        ) || 0,
                                        qtyDefault: Number(
                                          assembly.rollup?.sewnAvailableQty ?? 0
                                        ) || 0,
                                        expectedTypes: [nextSendStep.type],
                                        sewMissing:
                                          (Number(assembly.rollup?.sewGoodQty ?? 0) ||
                                            0) <= 0,
                                      },
                                    ],
                                  })
                                }
                              >
                                Send out
                              </Button>
                            ) : null}
                            {nextReceiveStep ? (
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() =>
                                  openBatchModal({
                                    mode: "receive",
                                    vendorId: nextReceiveStep.vendor?.id ?? null,
                                    rows: [
                                      {
                                        key: `asm-${assembly.id}-${nextReceiveStep.type}`,
                                        assemblyId: assembly.id,
                                        assemblyLabel: `A${assembly.id}`,
                                        stepType: nextReceiveStep.type,
                                        stepLabel: nextReceiveStep.label,
                                        qty: Math.max(
                                          (Number(nextReceiveStep.qtyOut ?? 0) || 0) -
                                            (Number(nextReceiveStep.qtyIn ?? 0) || 0),
                                          0
                                        ),
                                        qtyDefault: Math.max(
                                          (Number(nextReceiveStep.qtyOut ?? 0) || 0) -
                                            (Number(nextReceiveStep.qtyIn ?? 0) || 0),
                                          0
                                        ),
                                        expectedTypes: [nextReceiveStep.type],
                                        sewMissing: false,
                                      },
                                    ],
                                  })
                                }
                              >
                                Receive in
                              </Button>
                            ) : null}
                          </Group>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {assembly.risk.externalEta
                        ? formatDate(assembly.risk.externalEta)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        {supplyChips.length ? (
                          <Group gap="xs" wrap="wrap">
                            {supplyChips.map((chip) => (
                              <Tooltip
                                key={chip.key}
                                label={chip.tooltip}
                                disabled={!chip.tooltip}
                              >
                                <Badge
                                  color={chip.color}
                                  variant={chip.variant}
                                  size="sm"
                                  style={{ cursor: "pointer" }}
                                  onClick={() => setPoHoldFocus(assembly)}
                                >
                                  {chip.label}
                                </Badge>
                              </Tooltip>
                            ))}
                            {canDebug ? (
                              <Tooltip label="View debug">
                                <ActionIcon
                                  size="sm"
                                  variant="light"
                                  onClick={() => handleOpenDebug(assembly)}
                                >
                                  <IconBug size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                          </Group>
                        ) : (
                          <Group gap="xs">
                            <Text size="sm">—</Text>
                            {canDebug ? (
                              <Tooltip label="View debug">
                                <ActionIcon
                                  size="sm"
                                  variant="light"
                                  onClick={() => handleOpenDebug(assembly)}
                                >
                                  <IconBug size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                          </Group>
                        )}
                        {supplySummary.poHoldCount > 0 &&
                        assembly.risk.poHoldReason ? (
                          <Text size="xs" c="dimmed">
                            {assembly.risk.poHoldReason}
                          </Text>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {assembly.risk.poBlockingEta
                        ? formatDate(assembly.risk.poBlockingEta)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm">{formatDate(dateValue)}</Text>
                        <OverrideIndicator
                          isOverridden={dateSource === "OVERRIDE"}
                          tooltip={dateTooltip}
                        />
                        {dateSource === "DERIVED" ? (
                          <Tooltip label="Derived internal target date" withArrow>
                            <Text size="xs" c="dimmed">
                              Derived
                            </Text>
                          </Tooltip>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {formatQuantity(assembly.rollup?.readyToPackQty ?? 0)}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setPoHoldFocus(assembly)}
                      >
                        Details
                      </Button>
                      {assembly.materialCoverage?.materials?.length ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          ml="xs"
                          onClick={() => {
                            const mat =
                              assembly.materialCoverage?.materials.find(
                                (m) => (m.qtyUncovered ?? 0) > 0
                              ) ||
                              assembly.materialCoverage?.materials[0];
                            if (mat) {
                              setAssignTarget({
                                assembly,
                                productId: mat.productId,
                                productName: mat.productName,
                                uncovered: mat.qtyUncovered ?? 0,
                              });
                            }
                          }}
                        >
                          Assign to PO
                        </Button>
                      ) : null}
                    </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
            {!atRiskRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">No assemblies match these filters.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="vendor" pt="md">
          <Card withBorder padding="md">
            {selectedVendorRows.size > 0 ? (
              <Group justify="space-between" mb="sm">
                <Text size="sm">
                  {selectedVendorRows.size} selected
                </Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      openBatchReceiveFromVendor(
                        vendorRows.filter(({ assembly, step }) =>
                          selectedVendorRows.has(`${assembly.id}-${step.type}`)
                        )
                      )
                    }
                  >
                    Batch Receive In
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => setSelectedVendorRows(new Set())}
                  >
                    Clear
                  </Button>
                </Group>
              </Group>
            ) : null}
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36}>
                    <Checkbox
                      aria-label="Select all"
                      checked={
                        vendorRows.length > 0 &&
                        selectedVendorRows.size === vendorRows.length
                      }
                      indeterminate={
                        selectedVendorRows.size > 0 &&
                        selectedVendorRows.size < vendorRows.length
                      }
                      onChange={(e) => {
                        if (e.currentTarget.checked) {
                          setSelectedVendorRows(
                            new Set(
                              vendorRows.map(
                                ({ assembly, step }) =>
                                  `${assembly.id}-${step.type}`
                              )
                            )
                          );
                        } else {
                          setSelectedVendorRows(new Set());
                        }
                      }}
                    />
                  </Table.Th>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Step</Table.Th>
                  <Table.Th>Vendor</Table.Th>
                  <Table.Th>ETA</Table.Th>
                  <Table.Th>ETA source</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {vendorRows.map(({ assembly, step }) => (
                  <Table.Tr
                    key={`${assembly.id}-${step.type}-${step.etaDate ?? "na"}-${
                      step.vendor?.id ?? "none"
                    }`}
                  >
                    <Table.Td>
                      <Checkbox
                        aria-label={`Select A${assembly.id}`}
                        checked={selectedVendorRows.has(
                          `${assembly.id}-${step.type}`
                        )}
                        onChange={(e) => {
                          setSelectedVendorRows((prev) => {
                            const next = new Set(prev);
                            const key = `${assembly.id}-${step.type}`;
                            if (e.currentTarget.checked) next.add(key);
                            else next.delete(key);
                            return next;
                          });
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link
                            to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}
                          >
                            A{assembly.id}
                          </Link>
                        ) : (
                          <Text fw={600}>A{assembly.id}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {assembly.name || assembly.productName || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {assembly.job ? (
                        <Stack gap={0}>
                          <Link to={`/jobs/${assembly.job.id}`}>
                            {formatJobLabel(assembly.job)}
                          </Link>
                          <Text size="xs" c="dimmed">
                            {assembly.job?.customerName || "—"}
                          </Text>
                        </Stack>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>{step.label}</Table.Td>
                    <Table.Td>{step.vendor?.name || "Pending"}</Table.Td>
                    <Table.Td>{formatDate(step.etaDate)}</Table.Td>
                    <Table.Td>
                      {step.leadTimeSource
                        ? LEAD_TIME_SOURCE_LABELS[step.leadTimeSource] ||
                          step.leadTimeSource
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => openBatchReceiveFromVendor([{ assembly, step }])}
                      >
                        Receive in
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!vendorRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">No open vendor steps.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="actions" pt="md">
          <Card withBorder padding="md">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Detail</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {nextActionRows.map(({ assembly, action }, index) => (
                  <Table.Tr key={`${assembly.id}-${action.kind}-${index}`}>
                    <Table.Td>{renderActionLabel(action.kind)}</Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link
                            to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}
                          >
                            A{assembly.id} –{" "}
                            {assembly.name || assembly.productName || "—"}
                          </Link>
                        ) : (
                          <Text fw={600}>
                            A{assembly.id} –{" "}
                            {assembly.name || assembly.productName || "—"}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {assembly.job ? formatJobLabel(assembly.job) : "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{action.label}</Text>
                      {action.detail ? (
                        <Text size="xs" c="dimmed">
                          {action.detail}
                        </Text>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!nextActionRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">Nothing needs attention right now.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="materials" pt="md">
          <Card withBorder padding="md">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Material</Table.Th>
                  <Table.Th>Required</Table.Th>
                  <Table.Th>Reserved (PO / Batch)</Table.Th>
                  <Table.Th>Uncovered</Table.Th>
                  <Table.Th>ETA</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {materialsShortRows.map(({ assembly, material, summary }) => {
                  const chips = buildSupplyChips(summary, { showCounts: false });
                  return (
                  <Table.Tr key={`${assembly.id}-${material.productId}`}>
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link
                            to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}
                          >
                            A{assembly.id}
                          </Link>
                        ) : (
                          <Text fw={600}>A{assembly.id}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {assembly.name || assembly.productName || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm">
                          {material.productName ??
                            `Product ${material.productId}`}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Reserved: PO {formatQuantity(material.qtyReservedToPo)} •
                          Batch {formatQuantity(material.qtyReservedToBatch)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {material.qtyRequired != null
                        ? formatQuantity(material.qtyRequired)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      {formatQuantity(material.qtyReservedToPo)} /{" "}
                      {formatQuantity(material.qtyReservedToBatch)}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        {chips.length ? (
                          <Group gap="xs" wrap="wrap">
                            {chips.map((chip) => (
                              <Tooltip
                                key={chip.key}
                                label={chip.tooltip}
                                disabled={!chip.tooltip}
                              >
                                <Badge
                                  color={chip.color}
                                  size="sm"
                                  variant={chip.variant}
                                >
                                  {chip.label}
                                </Badge>
                              </Tooltip>
                            ))}
                          </Group>
                        ) : (
                          <Badge color="green" size="sm">
                            Covered
                          </Badge>
                        )}
                        <Text size="xs" c="dimmed">
                          Raw {formatQuantity(material.qtyUncovered)} · Tol{" "}
                          {formatQuantity(material.tolerance.qty)} → Eff{" "}
                          {formatQuantity(material.qtyUncoveredAfterTolerance)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {material.earliestEta
                        ? formatDate(material.earliestEta)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setPoHoldFocus(assembly)}
                      >
                        View
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
                })}
              </Table.Tbody>
            </Table>
            {!materialsShortRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">No material shortages detected.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>
      </Tabs>

      <Drawer
        opened={!!poHoldFocus}
        onClose={() => setPoHoldFocus(null)}
        title="PO Hold details"
        position="right"
        size="lg"
      >
        {poHoldFocus ? (
          <MaterialCoverageDetails
            assemblyId={poHoldFocus.id}
            coverage={poHoldFocus.materialCoverage}
            toleranceDefaults={toleranceDefaults}
            toleranceAbs={poHoldFocus.materialCoverageToleranceAbs}
            tolerancePct={poHoldFocus.materialCoverageTolerancePct}
            onAcceptGap={handleAcceptGap}
            acceptingProductId={acceptGapTargetProductId}
            onTrimReservations={handleTrimReservations}
            trimmingLineId={trimmingLineId}
            onSettleReservations={handleSettleReservations}
            settlingProductId={settlingProductId}
            onUpdateTolerance={handleToleranceSave}
            onResetTolerance={handleToleranceReset}
            toleranceSaving={toleranceFetcher.state !== "idle"}
          />
        ) : null}
      </Drawer>
      <Modal
        opened={!!batchAction}
        onClose={() => setBatchAction(null)}
        title={
          batchAction?.mode === "send"
            ? "Batch Send Out"
            : "Batch Receive In"
        }
        size="xl"
        centered
      >
        {batchAction ? (
          <Stack gap="sm">
            {batchFetcher.data?.ok ? (
              <Alert color="green" title="Batch complete">
                Created {batchFetcher.data.created ?? 0} activities
                {batchFetcher.data.skippedMissingStep
                  ? `, skipped ${batchFetcher.data.skippedMissingStep} (no expected step)`
                  : batchFetcher.data.skipped
                  ? `, skipped ${batchFetcher.data.skipped}`
                  : ""}
                .
              </Alert>
            ) : null}
            {batchError ? (
              <Text size="sm" c="red">
                {batchError}
              </Text>
            ) : null}
            {batchAction.availableStepTypes.length ? (
              <Select
                label="Step type"
                data={batchAction.availableStepTypes}
                value={batchAction.selectedStepType}
                onChange={(val) => {
                  setBatchError(null);
                  setBatchAction((prev) =>
                    prev
                      ? {
                          ...prev,
                          selectedStepType: val || null,
                        }
                      : prev
                  );
                }}
                placeholder="Select step type"
                searchable
                clearable
              />
            ) : (
              <Text size="sm" c="dimmed">
                No expected external steps found for these rows.
              </Text>
            )}
            {batchAction.mode === "send" &&
            batchAction.rows.length === 1 &&
            batchAction.rows[0].sewMissing ? (
              <Alert color="yellow" title="Sew missing">
                <Stack gap="xs">
                  <Text size="sm">
                    This assembly has no Sew recorded. You can continue, but the
                    step will be marked low confidence.
                  </Text>
                  <Checkbox
                    label="Record Sew now for the same qty"
                    checked={batchAction.recordSewNow}
                    onChange={(e) =>
                      setBatchAction((prev) =>
                        prev
                          ? {
                              ...prev,
                              recordSewNow: e.currentTarget.checked,
                            }
                          : prev
                      )
                    }
                  />
                </Stack>
              </Alert>
            ) : null}
            <Group grow align="flex-end">
              <Select
                label="Vendor"
                placeholder="Select vendor"
                data={vendorSelectData}
                searchable
                clearable
                value={batchVendorId ? String(batchVendorId) : null}
                onChange={(val) => {
                  setBatchVendorId(val ? Number(val) : null);
                  if (val) setBatchUnknownVendor(false);
                  setBatchError(null);
                }}
                disabled={batchUnknownVendor}
              />
              <Checkbox
                label="Unknown vendor (allow)"
                checked={batchUnknownVendor}
                onChange={(e) => {
                  const next = e.currentTarget.checked;
                  setBatchUnknownVendor(next);
                  if (next) setBatchVendorId(null);
                  setBatchError(null);
                }}
              />
              <DatePickerInput
                label="Date"
                value={batchDate}
                onChange={setBatchDate}
              />
            </Group>
            <Table striped withTableBorder highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Step</Table.Th>
                  <Table.Th>Size breakdown</Table.Th>
                  <Table.Th>Default</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {batchAction.rows.map((row) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>{row.assemblyLabel}</Table.Td>
                    <Table.Td>
                      {batchAction.selectedStepType
                        ? batchAction.availableStepTypes.find(
                            (opt) => opt.value === batchAction.selectedStepType
                          )?.label ?? batchAction.selectedStepType
                        : row.stepLabel || "—"}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap="xs">
                        {(row.variantLabels?.length
                          ? row.variantLabels
                          : ["Qty"]
                        ).map((label, idx) => (
                          <Group
                            key={`${row.key}-var-${idx}`}
                            gap="xs"
                            align="center"
                          >
                            <Text size="xs" w={80}>
                              {label || `Variant ${idx + 1}`}
                            </Text>
                            <TextInput
                              type="number"
                              value={String(row.qtyBreakdown[idx] ?? 0)}
                              onChange={(e) =>
                                handleBatchRowBreakdownChange(
                                  row.key,
                                  idx,
                                  e.currentTarget.value
                                )
                              }
                            />
                          </Group>
                        ))}
                        <Text
                          size="xs"
                          c={
                            (row.qtyBreakdown || []).reduce(
                              (sum, value) => sum + (Number(value) || 0),
                              0
                            ) === row.qtyDefault
                              ? "dimmed"
                              : "red"
                          }
                        >
                          Total{" "}
                          {(row.qtyBreakdown || []).reduce(
                            (sum, value) => sum + (Number(value) || 0),
                            0
                          )}{" "}
                          / Target {formatQuantity(row.qtyDefault)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{formatQuantity(row.qtyDefault)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => setBatchAction(null)}
                disabled={batchFetcher.state !== "idle"}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBatchSubmit}
                loading={batchFetcher.state !== "idle"}
                disabled={!batchAction.rows.length}
              >
                {batchAction.mode === "send"
                  ? "Send out"
                  : "Receive in"}
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
      <DebugDrawer
        opened={!!debugTarget}
        onClose={() => setDebugTarget(null)}
        title={`Debug – A${debugTarget?.id ?? ""}`}
        payload={debugFetcher.data as any}
        loading={debugFetcher.state !== "idle"}
      />

      <AssignToPoModal
        target={assignTarget}
        onClose={() => setAssignTarget(null)}
        onSubmit={handleAssignSubmit}
        submitting={assignFetcher.state !== "idle"}
      />
    </Stack>
  );
}

function getTargetDate(assembly: LoaderAssembly) {
  const raw = assembly.job?.targetDate || assembly.job?.dropDeadDate;
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

type SupplyLineIssue = {
  lineId: number;
  purchaseOrderId: number | null;
  overReserved: number;
};

type SupplyLineBlock = {
  lineId: number;
  purchaseOrderId: number | null;
  reason: string | null;
  unreceivedExpected: number | null;
  etaDate: string | null;
};

type SupplySummary = {
  rank: number;
  overReservedLines: SupplyLineIssue[];
  blockedLines: SupplyLineBlock[];
  poHoldCount: number;
  dueSoonCount: number;
  withinToleranceCount: number;
  coveredCount: number;
  hasDemand: boolean;
};

type SupplyChip = {
  key: string;
  label: string;
  color: string;
  variant?: "filled" | "light";
  tooltip?: ReactNode;
};

function emptySupplySummary(): SupplySummary {
  return {
    rank: 6,
    overReservedLines: [],
    blockedLines: [],
    poHoldCount: 0,
    dueSoonCount: 0,
    withinToleranceCount: 0,
    coveredCount: 0,
    hasDemand: false,
  };
}

function summarizeCoverage(
  coverage: LoaderAssembly["materialCoverage"] | null | undefined
): SupplySummary {
  if (!coverage) return emptySupplySummary();
  return summarizeMaterials(coverage.materials || []);
}

function summarizeMaterials(materials: MaterialCoverageItem[]): SupplySummary {
  if (!materials.length) return emptySupplySummary();
  const overReservedMap = new Map<
    number,
    { overReserved: number; purchaseOrderId: number | null }
  >();
  const blockedMap = new Map<number, SupplyLineBlock>();
  let poHoldCount = 0;
  let dueSoonCount = 0;
  let withinToleranceCount = 0;
  let coveredCount = 0;
  let hasDemand = false;

  materials.forEach((material) => {
    const required = material.qtyRequired ?? 0;
    if (required > 0) {
      hasDemand = true;
      if (material.status === "PO_HOLD") poHoldCount += 1;
      else if (material.status === "DUE_SOON") dueSoonCount += 1;
      else if (material.status === "POTENTIAL_UNDERCUT")
        withinToleranceCount += 1;
      else if (material.status === "OK") coveredCount += 1;
    }
    material.reservations.forEach((res) => {
      if (
        res.type !== "PO" ||
        !res.purchaseOrderLineId ||
        res.settledAt
      )
        return;
      const overReserved = Number(res.overReserved ?? 0) || 0;
      if (overReserved > 0) {
        const lineId = res.purchaseOrderLineId;
        const prior = overReservedMap.get(lineId);
        if (!prior || overReserved > prior.overReserved) {
          overReservedMap.set(lineId, {
            overReserved,
            purchaseOrderId: res.purchaseOrderId ?? null,
          });
        }
      }
      if (res.status === "BLOCKED" && res.purchaseOrderLineId) {
        const lineId = res.purchaseOrderLineId;
        if (!blockedMap.has(lineId)) {
          blockedMap.set(lineId, {
            lineId,
            purchaseOrderId: res.purchaseOrderId ?? null,
            reason: res.reason ?? null,
            unreceivedExpected:
              res.unreceivedExpected != null
                ? Number(res.unreceivedExpected)
                : null,
            etaDate: res.etaDate ?? null,
          });
        }
      }
    });
  });

  const overReservedLines = Array.from(overReservedMap.entries()).map(
    ([lineId, entry]) => ({
      lineId,
      overReserved: entry.overReserved,
      purchaseOrderId: entry.purchaseOrderId,
    })
  );
  const blockedLines = Array.from(blockedMap.values());

  const rank = overReservedLines.length
    ? 0
    : blockedLines.length
    ? 1
    : poHoldCount > 0
    ? 2
    : dueSoonCount > 0
    ? 3
    : withinToleranceCount > 0
    ? 4
    : hasDemand
    ? 5
    : 6;

  return {
    rank,
    overReservedLines,
    blockedLines,
    poHoldCount,
    dueSoonCount,
    withinToleranceCount,
    coveredCount,
    hasDemand,
  };
}

function buildSupplyChips(
  summary: SupplySummary,
  options: { showCounts: boolean }
): SupplyChip[] {
  const chips: SupplyChip[] = [];
  if (summary.overReservedLines.length) {
    const count = summary.overReservedLines.length;
    chips.push({
      key: "over-reserved",
      label: options.showCounts
        ? `OVER-RESERVED ${count}`
        : "OVER-RESERVED",
      color: "red",
      variant: "filled",
      tooltip: renderOverReservedTooltip(summary.overReservedLines),
    });
  }
  if (summary.blockedLines.length) {
    const count = summary.blockedLines.length;
    chips.push({
      key: "eta-blocked",
      label: options.showCounts ? `ETA BLOCKED ${count}` : "ETA BLOCKED",
      color: "orange",
      variant: "filled",
      tooltip: renderBlockedTooltip(summary.blockedLines),
    });
  }
  if (summary.poHoldCount > 0) {
    chips.push({
      key: "po-hold",
      label: options.showCounts
        ? `PO HOLD ${summary.poHoldCount}`
        : "PO HOLD",
      color: "red",
      variant: "filled",
    });
  }
  if (summary.dueSoonCount > 0) {
    chips.push({
      key: "due-soon",
      label: options.showCounts
        ? `DUE SOON ${summary.dueSoonCount}`
        : "DUE SOON",
      color: "yellow",
      variant: "light",
    });
  }
  if (summary.withinToleranceCount > 0) {
    chips.push({
      key: "within-tolerance",
      label: options.showCounts
        ? `Within tolerance ${summary.withinToleranceCount}`
        : "Within tolerance",
      color: "gray",
      variant: "light",
    });
  }
  if (!chips.length && summary.hasDemand) {
    chips.push({
      key: "covered",
      label: "Covered",
      color: "green",
      variant: "filled",
    });
  }
  return chips;
}

function formatPoLineLabel(
  purchaseOrderId: number | null | undefined,
  lineId: number | null | undefined
) {
  if (purchaseOrderId && lineId) return `PO #${purchaseOrderId}, Line #${lineId}`;
  if (lineId) return `PO line #${lineId}`;
  if (purchaseOrderId) return `PO #${purchaseOrderId}`;
  return "PO line";
}

function renderOverReservedTooltip(lines: SupplyLineIssue[]) {
  return (
    <Stack gap={2}>
      {lines.map((line) => (
        <Text size="xs" key={line.lineId}>
          {formatPoLineLabel(line.purchaseOrderId, line.lineId)} over-reserved by{" "}
          {formatQuantity(line.overReserved)}
        </Text>
      ))}
    </Stack>
  );
}

function renderBlockedTooltip(lines: SupplyLineBlock[]) {
  return (
    <Stack gap={2}>
      {lines.map((line) => (
        <Text size="xs" key={line.lineId}>
          {formatPoLineLabel(line.purchaseOrderId, line.lineId)}{" "}
          {line.reason ?? "ETA blocked"}
          {line.unreceivedExpected != null
            ? ` · Unreceived ${formatQuantity(line.unreceivedExpected)}`
            : ""}
        </Text>
      ))}
    </Stack>
  );
}

function AssignToPoModal({
  target,
  onClose,
  onSubmit,
  submitting,
}: {
  target: {
    assembly: LoaderAssembly;
    productId: number;
    productName: string | null;
    uncovered: number;
  } | null;
  onClose: () => void;
  onSubmit: (poLineId: number, qty: number) => void;
  submitting: boolean;
}) {
  const [poLineId, setPoLineId] = useState<number | null>(null);
  const [qty, setQty] = useState<number>(0);

  useEffect(() => {
    if (target) {
      setQty(target.uncovered || 0);
      setPoLineId(null);
    }
  }, [target]);
  const computeRemaining = useCallback((line: any) => {
    if (!line) return 0;
    const expected =
      Number(line.qtyExpected ?? 0) > 0
        ? Number(line.qtyExpected ?? 0)
        : Number(line.qtyOrdered || 0) || 0;
    const received = Number(line.qtyReceived || 0) || 0;
    const reserved = Number(line.reservedQty || 0) || 0;
    if (line.availableQty != null && Number.isFinite(line.availableQty)) {
      return Math.max(Number(line.availableQty) || 0, 0);
    }
    return Math.max(expected - received - reserved, 0);
  }, []);

  useEffect(() => {
    if (!poLineId) return;
    if (!target) return;
    const line = (target.assembly.poLines || []).find(
      (l: any) => l.id === poLineId
    );
    if (!line) return;
    const remaining = computeRemaining(line);
    setQty((prev) => {
      const safePrev = Number(prev || 0);
      if (!Number.isFinite(safePrev) || safePrev <= 0) {
        return remaining || 0;
      }
      return Math.min(safePrev, remaining || 0);
    });
  }, [poLineId, target, computeRemaining]);

  if (!target) return null;
  const { assembly, productId, productName, uncovered } = target;
  const options =
    (assembly.poLines || []).filter(
      (line) =>
        (line.productId ?? null) === productId &&
        computeRemaining(line) > 0
    ) || [];
  const selectedLine = options.find((line) => line.id === poLineId) || null;
  const remainingForSelected = selectedLine
    ? computeRemaining(selectedLine)
    : null;

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Assign to PO – A${assembly.id}`}
      centered
    >
      <Stack gap="sm">
        <Text size="sm">
          {productName ?? `Product ${productId}`} – Uncovered{" "}
          {formatQuantity(uncovered)}
        </Text>
        <NativeSelect
          label="PO line"
          value={poLineId ? String(poLineId) : ""}
          onChange={(e) => {
            const val = Number(e.currentTarget.value);
            setPoLineId(Number.isFinite(val) ? val : null);
          }}
          data={[
            { value: "", label: "Select a PO line" },
            ...options.map((line) => ({
              value: String(line.id),
              label: `PO#${line.purchaseOrderId ?? line.id} • Remaining ${formatQuantity(
                computeRemaining(line)
              )} • Reserved ${formatQuantity(line.reservedQty ?? 0)} • ETA ${formatDate(
                line.etaDate
              )}`,
            })),
          ]}
        />
        {remainingForSelected != null ? (
          <Text size="xs" c="dimmed">
            Available qty: {formatQuantity(remainingForSelected)}
          </Text>
        ) : null}
        <TextInput
          label="Quantity to reserve"
          value={qty}
          onChange={(e) => setQty(Number(e.currentTarget.value) || 0)}
          type="number"
          min={0}
          step="any"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!poLineId || qty <= 0}
            onClick={() => {
              if (!poLineId || qty <= 0) return;
              onSubmit(poLineId, qty);
            }}
            loading={submitting}
          >
            Assign
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

async function resolveUserLabel(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, firstName: true, lastName: true },
  });
  const display =
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return display || user?.email || `user:${userId}`;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0";
  return `${Math.round(Number(value) * 100) / 100}`;
}

function renderExternalStatus(risk: AssemblyRiskSignals) {
  if (risk.hasExternalLate) {
    return (
      <Badge color="red" size="sm">
        Late
      </Badge>
    );
  }
  if (risk.externalDueSoon) {
    return (
      <Badge color="orange" size="sm">
        Due soon
      </Badge>
    );
  }
  return (
    <Badge color="gray" size="sm">
      On track
    </Badge>
  );
}

function renderActionLabel(kind: string) {
  switch (kind) {
    case "FOLLOW_UP_VENDOR":
      return "Follow up vendor";
    case "RESOLVE_PO":
      return "Resolve PO";
    case "SEND_OUT":
      return "Send out";
    default:
      return kind;
  }
}

function formatJobLabel(job: LoaderAssembly["job"]) {
  if (!job) return "—";
  if (job.projectCode) return `${job.projectCode} • Job ${job.id}`;
  return `Job ${job.id}`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatQuantity(value: number | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString();
}

function stepTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function parseAttentionSort(value: string | null): ProductionAttentionSort {
  switch ((value || "").toLowerCase()) {
    case "deadline":
      return "deadline";
    case "customer":
      return "customer";
    case "job":
      return "job";
    case "assembly":
      return "assembly";
    case "newest":
      return "newest";
    case "oldest":
      return "oldest";
    default:
      return "priority";
  }
}

function parseAttentionFilters(
  params: URLSearchParams
): ProductionAttentionFilters {
  return {
    includeHeld: params.get("includeHeld") !== "0",
    onlyNotStarted: params.get("onlyNotStarted") === "1",
    onlyDueSoon: params.get("onlyDueSoon") === "1",
    onlyBlocked: params.get("onlyBlocked") === "1",
  };
}

function collapseAttentionSignals(
  signals: ProductionAttentionRow["attentionSignals"],
  maxVisible: number
): ProductionAttentionRow["attentionSignals"] {
  if (signals.length <= maxVisible) return signals;
  const visible = signals.slice(0, maxVisible);
  const hidden = signals.slice(maxVisible);
  visible.push({
    key: `overflow-${hidden.length}`,
    tone: "neutral",
    label: `+${hidden.length}`,
    tooltip: hidden.map((signal) => signal.label).join(" · "),
  });
  return visible;
}
