import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import {
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useSubmit,
  useRevalidator,
  Link,
} from "@remix-run/react";
import { useForm } from "react-hook-form";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import {
  useEffect,
  useState,
  type ReactNode,
  useMemo,
  useCallback,
} from "react";
import { BreadcrumbSet, getLogger, useInitGlobalFormContext } from "@aa/timber";
import { useRecordContext } from "../../../base/record/RecordContext";
import { AssembliesEditor } from "~/modules/job/components/AssembliesEditor";
import { computeEffectiveAssemblyHold, normalizeAssemblyState } from "~/modules/job/stateUtils";
import { useRegisterNavLocation } from "~/hooks/useNavLocation";
import { MaterialCoverageDetails } from "~/modules/materials/components/MaterialCoverageDetails";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import {
  IconBan,
  IconBug,
  IconMenu2,
} from "@tabler/icons-react";
import { showToastError } from "~/utils/toast";
import { loadAssemblyDetailVM } from "~/modules/job/services/assemblyDetailVM.server";
import { handleAssemblyDetailAction } from "~/modules/job/services/assemblyDetailActions.server";
import {
  computeEffectiveOrderedBreakdown,
  computeOrderedTotal,
  sumBreakdownArrays,
} from "~/modules/job/quantityUtils";
import { getVariantLabels } from "~/utils/getVariantLabels";
import { formatAddressLines } from "~/utils/addressFormat";
import { LayoutFormRenderer } from "~/base/forms/LayoutFormRenderer";
import { assemblyDetailPage } from "./assemblyDetailPage";
import { assemblyStateConfig } from "~/base/state/configs";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params, request }: LoaderFunctionArgs) {
  return loadAssemblyDetailVM({ request, params });
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleAssemblyDetailAction({ request, params } as any);
}

export default function JobAssemblyRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "jobs" });
  const data = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const assemblies = (data.assemblies || []) as any[];
  const isGroup = (assemblies?.length || 0) > 1;
  const assemblyTargetsById = data.assemblyTargetsById || {};

  const job = { id: data?.job?.id as number, name: data?.job?.name ?? null };
  const log = getLogger("assembly");
  const idKey = (assemblies || []).map((a: any) => a.id).join(",");
  log.debug({ assemblyId: idKey, jobId: job.id }, "Rendering assembly view");

  const {
    costingStats,
    activityConsumptionMap,
    activities,
    products,
    productVariantSet,
    assemblyTypes,
    groupInfo,
  } = data as any;

  const nav = useNavigation();
  const [sp] = useSearchParams();
  const submit = useSubmit();
  const acceptGapFetcher = useFetcher<{ ok?: boolean }>();
  const toleranceFetcher = useFetcher<{ ok?: boolean }>();
  const reservationFetcher = useFetcher<{ ok?: boolean }>();
  const debugFetcher = useFetcher();
  const revalidator = useRevalidator();
  const { setCurrentId } = useRecordContext();
  const [debugTarget, setDebugTarget] = useState<{
    assemblyId: number;
    jobId: number;
  } | null>(null);
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false);
  const canDebug = Boolean(data?.canDebug);
  const primaryAssembly = assemblies?.[0] ?? null;
  const jobState = primaryAssembly?.job?.state ?? data?.job?.state ?? null;
  const isLoudMode = jobState === "DRAFT";
  const jobStateOptions = [
    { label: "Draft", value: "DRAFT" },
    { label: "New", value: "NEW" },
    { label: "Active", value: "ACTIVE" },
    { label: "Complete", value: "COMPLETE" },
    { label: "Canceled", value: "CANCELED" },
  ];
  const jobStateLabels = Object.fromEntries(
    jobStateOptions.map((opt) => [opt.value, opt.label])
  ) as Record<string, string>;
  const jobStateLabel = jobStateLabels[jobState || ""] || jobState || "—";
  const legacyAssemblyStatusLabel = useMemo(() => {
    if (!assemblies.length) return "—";
    const values = (assemblies as any[]).map(
      (a) => normalizeAssemblyState(a.status as string | null) ?? "DRAFT"
    );
    const unique = new Set(values);
    if (unique.size > 1) return "Mixed";
    const normalized = values[0];
    return assemblyStateConfig.states[normalized]?.label || normalized;
  }, [assemblies]);
  const overrideTargets = primaryAssembly
    ? assemblyTargetsById[primaryAssembly.id]
    : null;
  const shipToAddresses = (data.shipToAddresses || []) as any[];
  const shipToAddressOptions = useMemo(() => {
    return shipToAddresses.map((addr: any) => {
      const lines = formatAddressLines(addr);
      const base = lines[0] || `Address ${addr.id}`;
      const tail = lines.slice(1).join(", ");
      return {
        value: String(addr.id),
        label: tail ? `${base} — ${tail}` : base,
      };
    });
  }, [shipToAddresses]);
  const shipToAddressById = useMemo(() => {
    const map = new Map<number, any>();
    shipToAddresses.forEach((addr: any) => map.set(addr.id, addr));
    return map;
  }, [shipToAddresses]);

  const toDateInputValue = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    return null;
  };
  const toDateInputString = (value: Date | string | null | undefined) => {
    if (!value) return "";
    if (value instanceof Date) {
      return Number.isFinite(value.getTime())
        ? value.toISOString().slice(0, 10)
        : "";
    }
    if (typeof value === "string") {
      return value.length >= 10 ? value.slice(0, 10) : value;
    }
    return "";
  };
  const formatDateLabel = (value: Date | string | null | undefined) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const effectiveShipToAddress = overrideTargets?.shipToAddress?.value ?? null;
  const jobShipToLocation = overrideTargets?.legacyShipToLocation?.value ?? null;
  const formatAddressLabel = (addr: any) => {
    const resolved =
      typeof addr === "number" ? shipToAddressById.get(addr) : addr;
    if (!resolved) return null;
    const lines = formatAddressLines(resolved);
    return lines.length ? lines.join(", ") : null;
  };
  const shipToHint = !effectiveShipToAddress && jobShipToLocation
    ? `Legacy ship-to location: ${jobShipToLocation.name || `Location ${jobShipToLocation.id}`}`
    : undefined;
  const productForAssembly =
    primaryAssembly?.productId != null
      ? (products || []).find(
          (p: any) => Number(p.id) === Number(primaryAssembly.productId)
        )
      : null;

  const initialInternalOverride = useMemo(
    () => toDateInputValue(primaryAssembly?.internalTargetDateOverride),
    [primaryAssembly?.internalTargetDateOverride]
  );
  const initialCustomerOverride = useMemo(
    () => toDateInputValue(primaryAssembly?.customerTargetDateOverride),
    [primaryAssembly?.customerTargetDateOverride]
  );
  const initialDropDeadOverride = useMemo(
    () => toDateInputValue(primaryAssembly?.dropDeadDateOverride),
    [primaryAssembly?.dropDeadDateOverride]
  );
  const initialShipToAddressOverride = useMemo(
    () => primaryAssembly?.shipToAddressIdOverride ?? null,
    [primaryAssembly?.shipToAddressIdOverride]
  );
  const [internalOverride, setInternalOverride] = useState<Date | null>(
    initialInternalOverride
  );
  const [customerOverride, setCustomerOverride] = useState<Date | null>(
    initialCustomerOverride
  );
  const [dropDeadOverride, setDropDeadOverride] = useState<Date | null>(
    initialDropDeadOverride
  );
  const [shipToAddressOverrideId, setShipToAddressOverrideId] = useState<
    number | null
  >(initialShipToAddressOverride);
  const initialAssemblyName = useMemo(
    () => primaryAssembly?.name || "",
    [primaryAssembly?.id, primaryAssembly?.name]
  );
  const initialAssemblyType = useMemo(
    () => primaryAssembly?.assemblyType || "Prod",
    [primaryAssembly?.id, primaryAssembly?.assemblyType]
  );
  const [assemblyName, setAssemblyName] = useState(initialAssemblyName);
  const [assemblyType, setAssemblyType] = useState(initialAssemblyType);

  const resetOverrides = useCallback(() => {
    setInternalOverride(initialInternalOverride);
    setCustomerOverride(initialCustomerOverride);
    setDropDeadOverride(initialDropDeadOverride);
    setShipToAddressOverrideId(initialShipToAddressOverride);
  }, [
    initialInternalOverride,
    initialCustomerOverride,
    initialDropDeadOverride,
    initialShipToAddressOverride,
  ]);
  useEffect(() => {
    resetOverrides();
  }, [primaryAssembly?.id, resetOverrides]);
  useEffect(() => {
    setAssemblyName(initialAssemblyName);
    setAssemblyType(initialAssemblyType);
  }, [primaryAssembly?.id, initialAssemblyName, initialAssemblyType]);
  useEffect(() => {
    if (actionData?.error) {
      showToastError(actionData.error);
    }
  }, [actionData]);
  useEffect(() => {
    const err = sp.get("asmHoldErr");
    if (!err) return;
    showToastError(
      err === "reason_required"
        ? "Assembly hold requires a reason."
        : "Assembly hold update blocked."
    );
  }, [sp]);
  useEffect(() => {
    const err = sp.get("asmDateErr");
    if (!err) return;
    const message =
      err === "internal_after_customer"
        ? "Internal target date must be on or before customer target date."
        : "Assembly overrides could not be saved.";
    showToastError(message);
  }, [sp]);
  useEffect(() => {
    const err = sp.get("asmCancelErr");
    if (!err) return;
    const messages: Record<string, string> = {
      reason_required: "Cancellation requires a reason.",
      qty_invalid: "Canceled quantity exceeds ordered quantity.",
      qty_below_progress:
        "Canceled quantity would go below finished/packed units.",
      override_required:
        "Cancellation goes below recorded progress and needs an override.",
      has_activity:
        "Assembly has production activity and cannot be fully canceled.",
    };
    showToastError(messages[err] || "Unable to cancel assembly.");
  }, [sp]);
  useEffect(() => {
    if (isGroup) setCurrentId(idKey);
    else if (assemblies?.[0]?.id) setCurrentId(assemblies[0].id);
  }, [isGroup, idKey, assemblies, setCurrentId]);

  // Prev/Next hotkeys handled globally in RecordProvider
  // Path building now automatic (replace last path segment with id); no custom builder needed.
  const [cutOpen, setCutOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<null | any>(null);
  useEffect(() => {
    if (
      (acceptGapFetcher.state === "idle" && acceptGapFetcher.data) ||
      (toleranceFetcher.state === "idle" && toleranceFetcher.data) ||
      (reservationFetcher.state === "idle" && reservationFetcher.data)
    ) {
      revalidator.revalidate();
    }
  }, [
    acceptGapFetcher.state,
    acceptGapFetcher.data,
    toleranceFetcher.state,
    toleranceFetcher.data,
    reservationFetcher.state,
    reservationFetcher.data,
    revalidator,
  ]);
  const coverageByAssembly = useMemo(() => {
    const map = new Map<number, any>();
    (data.materialCoverageByAssembly || []).forEach((entry: any) => {
      if (entry?.assemblyId != null) {
        map.set(entry.assemblyId, entry.coverage ?? null);
      }
    });
    return map;
  }, [data.materialCoverageByAssembly]);
  const handleAcceptGap = useCallback(
    (assemblyId: number, productId: number) => {
      const fd = new FormData();
      fd.set("_intent", "acceptGap");
      fd.set("assemblyId", String(assemblyId));
      fd.set("productId", String(productId));
      acceptGapFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
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
      toleranceFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [toleranceFetcher]
  );
  const handleToleranceReset = useCallback(
    (assemblyId: number) => {
      const fd = new FormData();
      fd.set("_intent", "updateTolerance");
      fd.set("assemblyId", String(assemblyId));
      fd.set("reset", "1");
      toleranceFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [toleranceFetcher]
  );
  const handleOverridesSave = useCallback(() => {
    if (!primaryAssembly) return;
    const fd = new FormData();
    fd.set("_intent", "assembly.update");
    fd.set("assemblyId", String(primaryAssembly.id));
    fd.set("returnTo", `/jobs/${job.id}/assembly/${primaryAssembly.id}`);
    fd.set(
      "internalTargetDateOverride",
      internalOverride ? toDateInputString(internalOverride) : ""
    );
    fd.set(
      "customerTargetDateOverride",
      customerOverride ? toDateInputString(customerOverride) : ""
    );
    fd.set(
      "dropDeadDateOverride",
      dropDeadOverride ? toDateInputString(dropDeadOverride) : ""
    );
    fd.set(
      "shipToAddressIdOverride",
      shipToAddressOverrideId != null ? String(shipToAddressOverrideId) : ""
    );
    submit(fd, { method: "post" });
  }, [
    primaryAssembly,
    internalOverride,
    customerOverride,
    dropDeadOverride,
    shipToAddressOverrideId,
    submit,
    job.id,
  ]);
  const resetAssemblyEdits = useCallback(() => {
    setAssemblyName(initialAssemblyName);
    setAssemblyType(initialAssemblyType);
  }, [initialAssemblyName, initialAssemblyType]);
  const handleAssemblySave = useCallback(() => {
    if (!primaryAssembly) return;
    const fd = new FormData();
    fd.set("_intent", "assembly.update");
    fd.set("assemblyId", String(primaryAssembly.id));
    fd.set("name", assemblyName);
    fd.set("assemblyType", assemblyType);
    if (typeof window !== "undefined") {
      fd.set("returnTo", window.location.pathname + window.location.search);
    }
    submit(fd, { method: "post" });
  }, [assemblyName, assemblyType, primaryAssembly, submit]);
  const assemblyDirty =
    (assemblyName || "").trim() !== (initialAssemblyName || "").trim() ||
    (assemblyType || "") !== (initialAssemblyType || "");
  const overridesDirty = useMemo(() => {
    if (!primaryAssembly) return false;
    const currentInternal = internalOverride
      ? toDateInputString(internalOverride)
      : "";
    const currentCustomer = customerOverride
      ? toDateInputString(customerOverride)
      : "";
    const currentDropDead = dropDeadOverride
      ? toDateInputString(dropDeadOverride)
      : "";
    const baseInternal = initialInternalOverride
      ? toDateInputString(initialInternalOverride)
      : "";
    const baseCustomer = initialCustomerOverride
      ? toDateInputString(initialCustomerOverride)
      : "";
    const baseDropDead = initialDropDeadOverride
      ? toDateInputString(initialDropDeadOverride)
      : "";
    const currentShipTo = shipToAddressOverrideId != null ? String(shipToAddressOverrideId) : "";
    const baseShipTo = initialShipToAddressOverride != null
      ? String(initialShipToAddressOverride)
      : "";
    return (
      currentInternal !== baseInternal ||
      currentCustomer !== baseCustomer ||
      currentDropDead !== baseDropDead ||
      currentShipTo !== baseShipTo
    );
  }, [
    primaryAssembly,
    internalOverride,
    customerOverride,
    dropDeadOverride,
    shipToAddressOverrideId,
    initialShipToAddressOverride,
    initialInternalOverride,
    initialCustomerOverride,
    initialDropDeadOverride,
  ]);
  const overridesFormHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => resetOverrides(),
      formState: { isDirty: overridesDirty },
    }),
    [overridesDirty, resetOverrides]
  );
  useInitGlobalFormContext(
    overridesFormHandlers as any,
    () => handleOverridesSave(),
    () => resetOverrides()
  );
  const assemblyTypeOptions = useMemo(
    () => (assemblyTypes || []).map((t: any) => t.label || String(t)),
    [assemblyTypes]
  );
  const handleTrimReservations = useCallback(
    (lineId: number) => {
      const fd = new FormData();
      fd.set("_intent", "reservations.trim");
      fd.set("lineId", String(lineId));
      reservationFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
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
      reservationFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [reservationFetcher]
  );
  const handleOpenDebug = useCallback(
    (assemblyId: number, jobId: number) => {
      setDebugTarget({ assemblyId, jobId });
      debugFetcher.load(`/jobs/${jobId}/assembly/${assemblyId}/debug`);
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

  const handleSubmitOrdered = (arr: number[]) => {
    const fd = new FormData();
    fd.set("_intent", "assembly.updateOrderedBreakdown");
    fd.set("orderedArr", JSON.stringify(arr));
    submit(fd, { method: "post" });
  };
  const [manualHoldSegment, setManualHoldSegment] = useState("OFF");
  const [manualHoldReason, setManualHoldReason] = useState("");
  const [manualHoldDirty, setManualHoldDirty] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelArr, setCancelArr] = useState<number[]>([]);
  const [cancelLabels, setCancelLabels] = useState<string[]>([]);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOverride, setCancelOverride] = useState(false);
  const [cancelMode, setCancelMode] = useState<"full" | "remaining">(
    "remaining"
  );
  const [cancelBaseline, setCancelBaseline] = useState("ORDER");
  const holdSegmentOptions = [
    { value: "OFF", label: "Off" },
    { value: "CLIENT", label: "Client hold" },
    { value: "INTERNAL", label: "Internal hold" },
  ];
  useEffect(() => {
    if (!primaryAssembly) return;
    const on = Boolean(primaryAssembly.manualHoldOn);
    const type =
      primaryAssembly.manualHoldType === "CLIENT" ? "CLIENT" : "INTERNAL";
    setManualHoldSegment(on ? type : "OFF");
    setManualHoldReason(String(primaryAssembly.manualHoldReason || ""));
    setManualHoldDirty(false);
  }, [
    primaryAssembly?.id,
    primaryAssembly?.manualHoldOn,
    primaryAssembly?.manualHoldType,
    primaryAssembly?.manualHoldReason,
  ]);
  const openCancelModal = (mode: "full" | "remaining") => {
    if (!primaryAssembly) return;
    const ordered = Array.isArray(primaryAssembly.qtyOrderedBreakdown)
      ? (primaryAssembly.qtyOrderedBreakdown as number[])
      : [];
    const existingCanceled = Array.isArray(
      (primaryAssembly as any).c_canceled_Breakdown
    )
      ? ((primaryAssembly as any).c_canceled_Breakdown as number[])
      : [];
    const effectiveOrdered = computeEffectiveOrderedBreakdown({
      orderedBySize: ordered,
      canceledBySize: existingCanceled,
    }).effective;
    const cut = Array.isArray((primaryAssembly as any).c_qtyCut_Breakdown)
      ? ((primaryAssembly as any).c_qtyCut_Breakdown as number[])
      : [];
    const sew = Array.isArray((primaryAssembly as any).c_qtySew_Breakdown)
      ? ((primaryAssembly as any).c_qtySew_Breakdown as number[])
      : [];
    const finish = Array.isArray((primaryAssembly as any).c_qtyFinish_Breakdown)
      ? ((primaryAssembly as any).c_qtyFinish_Breakdown as number[])
      : [];
    const pack = Array.isArray((primaryAssembly as any).c_qtyPack_Breakdown)
      ? ((primaryAssembly as any).c_qtyPack_Breakdown as number[])
      : [];
    const hasPack = pack.some((n) => Number(n) > 0);
    const hasFinish = finish.some((n) => Number(n) > 0);
    const hasSew = sew.some((n) => Number(n) > 0);
    const hasCut = cut.some((n) => Number(n) > 0);
    const baselineLabel = hasPack
      ? "PACK"
      : hasFinish
      ? "FINISH"
      : hasSew
      ? "SEW"
      : hasCut
      ? "CUT"
      : "ORDER";
    const baselineArr = hasPack
      ? pack
      : hasFinish
      ? finish
      : hasSew
      ? sew
      : hasCut
      ? cut
      : [];
    const defaultCancel =
      mode === "full"
        ? effectiveOrdered
        : effectiveOrdered.map((val, idx) =>
            Math.max(0, Number(val || 0) - (Number(baselineArr[idx] || 0) || 0))
          );
    const labels = (primaryAssembly.variantSet?.variants ||
      data.productVariantSet?.variants ||
      []) as string[];
    const trimmedLabels = getVariantLabels(
      labels,
      (primaryAssembly as any).c_numVariants
    );
    const lastNonZero = Math.max(
      ...defaultCancel.map((n, idx) => (Number(n) > 0 ? idx : -1)),
      ...effectiveOrdered.map((n, idx) => (Number(n) > 0 ? idx : -1))
    );
    const effectiveLen = Math.max(trimmedLabels.length, lastNonZero + 1, 1);
    const colLabels = Array.from({ length: effectiveLen }, (_, idx) => {
      return trimmedLabels[idx] || `Variant ${idx + 1}`;
    });
    setCancelArr(
      Array.from({ length: effectiveLen }, (_, idx) => defaultCancel[idx] || 0)
    );
    setCancelLabels(colLabels);
    setCancelReason("");
    setCancelOverride(false);
    setCancelMode(mode);
    setCancelBaseline(baselineLabel);
    setCancelOpen(true);
  };
  const submitManualHold = () => {
    if (!primaryAssembly) return;
    const holdOn = manualHoldSegment !== "OFF";
    if (holdOn && !manualHoldReason.trim()) {
      showToastError("Assembly hold requires a reason.");
      return;
    }
    const fd = new FormData();
    fd.set("_intent", "assembly.update");
    fd.set("assemblyId", String(primaryAssembly.id));
    fd.set("manualHoldOn", holdOn ? "true" : "false");
    fd.set("manualHoldType", holdOn ? manualHoldSegment : "");
    fd.set("manualHoldReason", holdOn ? manualHoldReason.trim() : "");
    if (typeof window !== "undefined") {
      fd.set("returnTo", window.location.pathname + window.location.search);
    }
    submit(fd, { method: "post" });
    setManualHoldDirty(false);
  };
  const renderStatusBar = ({
    statusControls: _statusControls,
    whiteboardControl,
  }: {
    statusControls: ReactNode;
    whiteboardControl: ReactNode | null;
  }) => {
    const breadcrumbs = isGroup
      ? [
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
          {
            label: `Assemblies ${(assemblies || [])
              .map((a: any) => `A${a.id}`)
              .join(",")}`,
            href: `/jobs/${job.id}/assembly/${(assemblies || [])
              .map((a: any) => a.id)
              .join(",")}`,
          },
        ]
      : [
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
          {
            label: `Assembly ${primaryAssembly?.id ?? ""}`,
            href: `/jobs/${job.id}/assembly/${primaryAssembly?.id ?? ""}`,
          },
        ];
    const hasProductionActivity =
      Number((primaryAssembly as any)?.c_qtyCut ?? 0) > 0 ||
      Number((primaryAssembly as any)?.c_qtySew ?? 0) > 0 ||
      Number((primaryAssembly as any)?.c_qtyFinish ?? 0) > 0 ||
      Number((primaryAssembly as any)?.c_qtyPack ?? 0) > 0;
    const actionsMenu =
      !isGroup && primaryAssembly ? (
        <Menu withinPortal position="bottom-end" shadow="sm">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Assembly actions"
            >
              <IconMenu2 size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {!hasProductionActivity ? (
              <Menu.Item
                leftSection={<IconBan size={14} />}
                onClick={() => openCancelModal("full")}
              >
                Cancel assembly...
              </Menu.Item>
            ) : null}
            {hasProductionActivity ? (
              <Menu.Item
                leftSection={<IconBan size={14} />}
                onClick={() => openCancelModal("remaining")}
              >
                Cancel remaining units...
              </Menu.Item>
            ) : null}
            <Menu.Item
              leftSection={<IconBug size={14} />}
              disabled={!canDebug}
              onClick={() => handleOpenDebug(primaryAssembly.id, job.id)}
            >
              Debug
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : null;
    const manualHoldDisabled =
      primaryAssembly?.job?.state === "COMPLETE" ||
      primaryAssembly?.job?.state === "CANCELED";
    const manualHoldOn = manualHoldSegment !== "OFF";
    const effectiveHold = computeEffectiveAssemblyHold({
      jobHoldOn: Boolean(primaryAssembly?.job?.jobHoldOn),
      manualHoldOn,
    });
    const effectiveHoldLabel = effectiveHold
      ? primaryAssembly?.job?.jobHoldOn && manualHoldOn
        ? "Held (Job + Assembly)"
        : primaryAssembly?.job?.jobHoldOn
        ? "Held (Job)"
        : "Held (Assembly)"
      : null;
    const manualHoldControls =
      !isGroup && primaryAssembly ? (
        <Stack gap={4}>
          <SegmentedControl
            data={holdSegmentOptions}
            value={manualHoldSegment}
            disabled={manualHoldDisabled}
            onChange={(value) => {
              setManualHoldSegment(value);
              if (value === "OFF") {
                setManualHoldReason("");
              }
              setManualHoldDirty(true);
            }}
            size="xs"
          />
          {manualHoldSegment !== "OFF" ? (
            <Textarea
              placeholder="Hold reason"
              value={manualHoldReason}
              onChange={(e) => {
                setManualHoldReason(e.currentTarget.value);
                setManualHoldDirty(true);
              }}
              autosize
              minRows={2}
            />
          ) : null}
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              disabled={
                manualHoldDisabled ||
                (!manualHoldDirty && manualHoldSegment === "OFF") ||
                (manualHoldSegment !== "OFF" && !manualHoldReason.trim())
              }
              onClick={submitManualHold}
            >
              Apply hold
            </Button>
            {effectiveHoldLabel ? (
              <Badge size="sm" color="orange" variant="light">
                {effectiveHoldLabel}
              </Badge>
            ) : null}
          </Group>
        </Stack>
      ) : null;
    const groupBadge =
      !isGroup && primaryAssembly?.assemblyGroupId ? (
        <Group gap="xs">
          <Badge variant="light">
            Group G{primaryAssembly.assemblyGroupId}
          </Badge>
          <Button
            size="xs"
            variant="light"
            onClick={() => setGroupDrawerOpen(true)}
          >
            View group
          </Button>
        </Group>
      ) : null;
    const canceledQty = Array.isArray(primaryAssembly?.c_canceled_Breakdown)
      ? (primaryAssembly.c_canceled_Breakdown as number[]).reduce(
          (sum, value) => sum + (Number(value) || 0),
          0
        )
      : 0;
    const canceledBadge =
      !isGroup && primaryAssembly && canceledQty > 0 ? (
        <Badge color="orange" variant="light">
          Canceled {canceledQty}/{cancelOrderedTotal}
        </Badge>
      ) : null;
    const jobStatusControl = (
      <Button variant="light" disabled>
        {jobStateLabel}
      </Button>
    );
    return (
      <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
        <BreadcrumbSet breadcrumbs={breadcrumbs} />
        <Group gap="sm" align="center" wrap="wrap">
          <Group gap="xs" align="center" wrap="nowrap">
            <Text size="xs" c="dimmed">
              Legacy: {legacyAssemblyStatusLabel}
            </Text>
            {jobStatusControl}
            {canceledBadge}
          </Group>
          {manualHoldControls}
          {groupBadge}
          {whiteboardControl}
          {actionsMenu}
        </Group>
      </Group>
    );
  };
  const cancelOrderedBySize = primaryAssembly
    ? ((primaryAssembly as any).qtyOrderedBreakdown as number[] | null) || []
    : [];
  const cancelExistingCanceled = Array.isArray(
    (primaryAssembly as any)?.c_canceled_Breakdown
  )
    ? ((primaryAssembly as any).c_canceled_Breakdown as number[])
    : [];
  const cancelOrderedTotal = computeOrderedTotal(cancelOrderedBySize);
  const cancelPackBySize = Array.isArray((primaryAssembly as any)?.c_qtyPack_Breakdown)
    ? ((primaryAssembly as any).c_qtyPack_Breakdown as number[])
    : [];
  const cancelFinishBySize = Array.isArray(
    (primaryAssembly as any)?.c_qtyFinish_Breakdown
  )
    ? ((primaryAssembly as any).c_qtyFinish_Breakdown as number[])
    : [];
  const cancelCutBySize = Array.isArray((primaryAssembly as any)?.c_qtyCut_Breakdown)
    ? ((primaryAssembly as any).c_qtyCut_Breakdown as number[])
    : [];
  const cancelSewBySize = Array.isArray((primaryAssembly as any)?.c_qtySew_Breakdown)
    ? ((primaryAssembly as any).c_qtySew_Breakdown as number[])
    : [];
  const cancelCombinedCanceled = sumBreakdownArrays([
    cancelExistingCanceled,
    cancelArr,
  ]);
  const cancelComputed = computeEffectiveOrderedBreakdown({
    orderedBySize: cancelOrderedBySize,
    canceledBySize: cancelCombinedCanceled,
  });
  const cancelNewTotal = cancelArr.reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  const cancelEffectiveOrdered = cancelComputed.total;
  const cancelHardBlock = cancelComputed.effective.some(
    (val, idx) =>
      val < (Number(cancelPackBySize[idx] ?? 0) || 0) ||
      val < (Number(cancelFinishBySize[idx] ?? 0) || 0)
  );
  const cancelSoftBlock = cancelComputed.effective.some(
    (val, idx) =>
      val <
      Math.max(
        Number(cancelCutBySize[idx] ?? 0) || 0,
        Number(cancelSewBySize[idx] ?? 0) || 0
      )
  );
  if (isGroup) {
    const quantityItems = (data.quantityItems || []) as any[];
    return (
      <Stack gap="lg">
        <AssembliesEditor
          job={job as any}
          assemblies={assemblies as any}
          quantityItems={quantityItems as any}
          priceMultiplier={1}
          costingStats={(costingStats || {}) as any}
          saveIntent="group.updateOrderedBreakdown"
          stateChangeIntent="assembly.update.fromGroup"
          groupContext={{ jobId: job.id, groupId: 0 }}
          products={products as any}
          activities={activities as any}
          activityConsumptionMap={activityConsumptionMap as any}
          packActivityReferences={data.packActivityReferences as any}
          assemblyTypeOptions={(assemblyTypes || []).map(
            (t: any) => t.label || ""
          )}
          defectReasons={data.defectReasons as any}
          renderStatusBar={renderStatusBar}
          packContext={data.packContext as any}
          primaryCostingIdByAssembly={data.primaryCostingIdByAssembly as any}
          rollupsByAssembly={data.rollupsByAssembly as any}
          vendorOptionsByStep={data.vendorOptionsByStep as any}
          legacyStatusReadOnly
        />
      </Stack>
    );
  }

  const assembly = assemblies[0] as any;
  // Single assembly view previously tried to destructure a top-level `costings` that
  // the loader never provided (loader only returns `assemblies` with nested `costings`).
  // This caused the costings table to render empty for single assembly while group view worked.
  // Treat single assembly as a degenerate group: rely on `assembly.costings` like group mode.
  const topForm = useForm({ defaultValues: {} });
  const assemblyDetailCtx = {
    isLoudMode,
    job,
    primaryAssembly,
    productForAssembly,
    assemblyTypeOptions,
    shipToAddressOptions: shipToAddressOptions as any,
    shipToAddressById,
    shipToHint,
    overrideTargets,
    formatDateLabel,
    formatAddressLabel,
    state: {
      assemblyName,
      setAssemblyName,
      assemblyType,
      setAssemblyType,
      internalOverride,
      setInternalOverride,
      customerOverride,
      setCustomerOverride,
      dropDeadOverride,
      setDropDeadOverride,
      shipToAddressOverrideId,
      setShipToAddressOverrideId,
    },
    dirty: {
      assembly: assemblyDirty,
      promises: overridesDirty,
    },
    actions: {
      saveAssembly: handleAssemblySave,
      resetAssembly: resetAssemblyEdits,
      savePromises: handleOverridesSave,
      resetPromises: resetOverrides,
    },
  };

  return (
    <Stack gap="lg">
      <AssembliesEditor
        job={job as any}
        assemblies={
          [
            {
              ...assembly,
              // Pull nested costings directly off the assembly (loader includes them)
              costings: ((assembly as any).costings || []) as any,
              qtyOrderedBreakdown: (assembly as any).qtyOrderedBreakdown || [],
              c_qtyOrdered: (assembly as any).c_qtyOrdered ?? 0,
              c_qtyCut: (assembly as any).c_qtyCut ?? 0,
            },
          ] as any
        }
        quantityItems={data.quantityItems as any}
        priceMultiplier={
          Number((assembly.job as any)?.company?.priceMultiplier ?? 1) || 1
        }
        costingStats={costingStats as any}
        saveIntent="assembly.updateOrderedBreakdown"
        stateChangeIntent="assembly.update"
        products={products as any}
        activities={activities as any}
        activityConsumptionMap={activityConsumptionMap as any}
        packActivityReferences={data.packActivityReferences as any}
        assemblyTypeOptions={(assemblyTypes || []).map(
          (t: any) => t.label || ""
        )}
        activityVariantLabels={
          (assembly.variantSet?.variants?.length
            ? (assembly.variantSet.variants as any)
            : (productVariantSet?.variants as any)) || []
        }
        defectReasons={data.defectReasons as any}
        renderStatusBar={renderStatusBar}
        packContext={data.packContext as any}
        primaryCostingIdByAssembly={data.primaryCostingIdByAssembly as any}
        rollupsByAssembly={data.rollupsByAssembly as any}
        vendorOptionsByStep={data.vendorOptionsByStep as any}
        legacyStatusReadOnly
        topContent={
          !isGroup && primaryAssembly ? (
            <LayoutFormRenderer
              page={assemblyDetailPage}
              form={topForm}
              mode="edit"
              ctx={assemblyDetailCtx}
            />
          ) : null
        }
        showAssemblySummary={!primaryAssembly || isGroup}
      />
      <Modal
        opened={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={
          primaryAssembly
            ? cancelMode === "full"
              ? `Cancel assembly - A${primaryAssembly.id}`
              : `Cancel remaining units - A${primaryAssembly.id}`
            : cancelMode === "full"
            ? "Cancel assembly"
            : "Cancel remaining units"
        }
        centered
        size="xl"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Ordered: {cancelOrderedTotal} | Effective: {cancelEffectiveOrdered} | Canceled: {cancelComputed.canceled.reduce((t, v) => t + (Number(v) || 0), 0)}
          </Text>
          {cancelMode === "remaining" ? (
            <Text size="xs" c="dimmed">
              Defaulting to remaining based on {cancelBaseline} totals.
            </Text>
          ) : null}
          {cancelLabels.length ? (
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {cancelLabels.map((label, i) => (
                    <Table.Th key={`c-h-${i}`} ta="center">
                      {label || `#${i + 1}`}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {cancelLabels.map((_label, i) => (
                    <Table.Td key={`c-c-${i}`}>
                      <TextInput
                        w="60px"
                        styles={{ input: { textAlign: "center" } }}
                        type="number"
                        value={cancelArr[i] ?? 0}
                        onChange={(e) => {
                          const v =
                            e.currentTarget.value === ""
                              ? 0
                              : Number(e.currentTarget.value);
                          setCancelArr((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? (Number.isFinite(v) ? v | 0 : 0) : x
                            )
                          );
                        }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              No size breakdown available for this assembly.
            </Text>
          )}
          <Textarea
            label="Reason"
            placeholder={
              cancelMode === "full"
                ? "Why is this assembly being canceled?"
                : "Why are the remaining units being canceled?"
            }
            value={cancelReason}
            onChange={(e) => setCancelReason(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Text size="sm">
            Effective ordered after cancel: {cancelEffectiveOrdered}
          </Text>
          {cancelHardBlock ? (
            <Text size="sm" c="red">
              Cancellation cannot reduce below finished/packed quantities.
            </Text>
          ) : cancelSoftBlock ? (
            <Checkbox
              label="Override: allow cancel below recorded cut/sew progress"
              checked={cancelOverride}
              onChange={(e) => setCancelOverride(e.currentTarget.checked)}
            />
          ) : null}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setCancelOpen(false)}>
              Close
            </Button>
            <Button
              color="red"
              disabled={
                cancelHardBlock ||
                (cancelSoftBlock && !cancelOverride) ||
                (cancelNewTotal > 0 && !cancelReason.trim())
              }
              onClick={() => {
                if (!primaryAssembly) return;
                const fd = new FormData();
                fd.set("_intent", "assembly.cancel");
                fd.set("assemblyId", String(primaryAssembly.id));
                fd.set("canceledBySize", JSON.stringify(cancelArr));
                fd.set("cancelReason", cancelReason.trim());
                fd.set("cancelMode", cancelMode);
                if (cancelOverride) fd.set("override", "true");
                if (typeof window !== "undefined") {
                  fd.set("returnTo", window.location.pathname + window.location.search);
                }
                submit(fd, { method: "post" });
                setCancelOpen(false);
              }}
            >
              Apply cancellation
            </Button>
          </Group>
        </Stack>
      </Modal>
      <MaterialCoverageDetails
        assemblyId={assembly.id}
        coverage={coverageByAssembly.get(assembly.id) ?? null}
        toleranceDefaults={data.toleranceDefaults}
        toleranceAbs={assembly.materialCoverageToleranceAbs ?? null}
        tolerancePct={assembly.materialCoverageTolerancePct ?? null}
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
      <DebugDrawer
        opened={!!debugTarget}
        onClose={() => setDebugTarget(null)}
        title={`Debug – A${debugTarget?.assemblyId ?? ""}`}
        payload={debugFetcher.data as any}
        loading={debugFetcher.state !== "idle"}
      />
      <Drawer
        opened={groupDrawerOpen}
        onClose={() => setGroupDrawerOpen(false)}
        title={`Group G${groupInfo?.id ?? ""}`}
        position="right"
        size="lg"
      >
        {groupInfo ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Coordination only. Assemblies remain separate for detail and edits.
            </Text>
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Legacy status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(groupInfo.assemblies || []).map((asm: any) => (
                  <Table.Tr key={asm.id}>
                    <Table.Td>A{asm.id}</Table.Td>
                    <Table.Td>{asm.name || "—"}</Table.Td>
                    <Table.Td>{asm.status || "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            No group details available.
          </Text>
        )}
      </Drawer>
    </Stack>
  );
}
