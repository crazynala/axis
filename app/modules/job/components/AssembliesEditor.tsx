import {
  ActionIcon,
  Alert,
  Button,
  Badge,
  Card,
  Checkbox,
  Divider,
  Grid,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  NativeSelect,
  Select,
  Textarea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconMenu2 } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { HotkeyAwareModalRoot } from "~/base/hotkeys/HotkeyAwareModal";
import {
  useEffect,
  useMemo,
  useState,
  Fragment,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { useInitGlobalFormContext } from "@aa/timber";
import { useFetcher, useRevalidator, useSubmit } from "@remix-run/react";
import { AssemblyQuantitiesCard } from "~/modules/job/components/AssemblyQuantitiesCard";
import { AssemblyCostingsTable } from "~/modules/job/components/AssemblyCostingsTable";
import { Link } from "@remix-run/react";
import {
  buildCostingRows,
  canEditQpuDefault,
} from "~/modules/job/services/costingsView";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { assemblyStateConfig } from "~/base/state/configs";
import {
  computeEffectiveAssemblyHold,
  normalizeAssemblyState,
} from "~/modules/job/stateUtils";
import { AssemblyActivityModal } from "~/components/AssemblyActivityModal";
import { AxisChip } from "~/components/AxisChip";
import { JumpLink } from "~/components/JumpLink";
import { AssemblyPackModal } from "~/modules/job/components/AssemblyPackModal";
import type { PackBoxSummary } from "~/modules/job/types/pack";
import type { StageRow } from "~/modules/job/types/stageRows";
import type { StageStats } from "~/modules/job/services/stageRows.server";
import type { CompanyOption } from "~/modules/company/components/CompanySelect";
import type { ExternalStageRow } from "~/modules/job/types/stageRows";

export type QuantityItem = {
  assemblyId: number;
  variants: { labels: string[]; numVariants: number };
  orderedRaw: number[];
  canceled: number[];
  ordered: number[];
  cut: number[];
  sew: number[];
  finish: number[];
  pack: number[];
  totals: { cut: number; sew: number; finish: number; pack: number };
  stageStats: {
    cut: StageStats;
    sew: StageStats;
    finish: StageStats;
    pack: StageStats;
    qc: StageStats;
  };
  stageRows: StageRow[];
  finishInput: { breakdown: number[]; total: number };
};

type MinimalCosting = Parameters<
  typeof buildCostingRows
>[0]["costings"][number];

type ActivityModalType = "cut" | "finish" | "pack";

export function AssembliesEditor(props: {
  job?: { id: number; name?: string | null } | null;
  assemblies: Array<
    any & {
      id: number;
      costings: MinimalCosting[];
      c_qtyOrdered?: number | null;
      c_qtyCut?: number | null;
      qtyOrderedBreakdown?: number[] | null;
      name?: string | null;
      status?: string | null;
      statusWhiteboard?: string | null;
      job?: { name?: string | null } | null;
      variantSet?: { variants?: string[] | null } | null;
    }
  >;
  quantityItems: QuantityItem[];
  priceMultiplier: number;
  costingStats?: Record<
    number,
    { allStock: number; locStock: number; used: number }
  >;
  saveIntent: string; // "assembly.updateOrderedBreakdown" | "group.updateOrderedBreakdown"
  stateChangeIntent?: string; // "assembly.update" | "assembly.update.fromGroup"
  // Assembly-only extras
  products?: Array<{ id: number; sku: string | null; name: string | null }>;
  activities?: any[];
  activityConsumptionMap?: Record<
    number,
    Record<number, Record<number, number>>
  >;
  primaryCostingIdByAssembly?: Record<number, number | null> | null;
  packActivityReferences?: Record<
    number,
    {
      kind: "shipment";
      shipmentLineId: number;
      shipmentId: number | null;
      trackingNo?: string | null;
      packingSlipCode?: string | null;
      shipmentType?: string | null;
    }
  >;
  activityVariantLabels?: string[]; // optional override of variant labels for activity table columns
  groupContext?: { jobId: number; groupId: number } | null;
  renderStatusBar?: (args: {
    statusControls: ReactNode;
    whiteboardControl: ReactNode | null;
  }) => ReactNode;
  packContext?: {
    openBoxes: PackBoxSummary[];
    stockLocation?: { id: number; name: string | null } | null;
  } | null;
  assemblyTypeOptions?: string[] | null;
  defectReasons?: Array<{ id: number; label: string | null }>;
  rollupsByAssembly?: Record<number, any> | null;
  vendorOptionsByStep?: Record<string, CompanyOption[]> | null;
  legacyStatusReadOnly?: boolean;
}) {
  const {
    job,
    assemblies,
    quantityItems,
    priceMultiplier,
    costingStats,
    saveIntent,
    stateChangeIntent,
    products,
    activities: activitiesProp,
    activityConsumptionMap,
    activityVariantLabels,
    groupContext,
    renderStatusBar,
    packContext,
    packActivityReferences,
    assemblyTypeOptions,
    defectReasons,
    primaryCostingIdByAssembly,
    rollupsByAssembly,
    vendorOptionsByStep,
    legacyStatusReadOnly,
  } = props;
  const activityList = activitiesProp || [];
  const submit = useSubmit();
  const externalStepFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const isGroup = (assemblies?.length ?? 0) > 1;
  const firstAssembly = assemblies[0];
  const assemblyTypeData = (
    assemblyTypeOptions || ["Prod", "Keep", "PP", "SMS"]
  ).map((label) => ({
    value: label,
    label,
  }));
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [createActivityType, setCreateActivityType] =
    useState<ActivityModalType>("cut");
  const [editActivity, setEditActivity] = useState<null | any>(null);
  const [cancelEditOpen, setCancelEditOpen] = useState(false);
  const [cancelEditActivity, setCancelEditActivity] = useState<any | null>(null);
  const [cancelEditBreakdown, setCancelEditBreakdown] = useState<number[]>([]);
  const [cancelEditReason, setCancelEditReason] = useState("");
  const [cancelEditDate, setCancelEditDate] = useState<Date | null>(new Date());
  const [cancelEditAssemblyId, setCancelEditAssemblyId] = useState<number | null>(
    null
  );
  const [modalAssemblyId, setModalAssemblyId] = useState<number | null>(
    firstAssembly?.id ?? null
  );
  const [packModalAssemblyId, setPackModalAssemblyId] = useState<number | null>(
    null
  );
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [deleteActivity, setDeleteActivity] = useState<any | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [defectModalOpen, setDefectModalOpen] = useState(false);
  const [defectAssemblyId, setDefectAssemblyId] = useState<number | null>(
    firstAssembly?.id ?? null
  );
  const [defectStage, setDefectStage] = useState<string>("finish");
  const [defectBreakdown, setDefectBreakdown] = useState<number[]>([]);
  const [defectReasonId, setDefectReasonId] = useState<string>("");
  const [defectDisposition, setDefectDisposition] = useState<string>("review");
  const [defectDate, setDefectDate] = useState<Date | null>(new Date());
  const [defectNotes, setDefectNotes] = useState<string>("");
  const [defectEditActivityId, setDefectEditActivityId] = useState<
    number | null
  >(null);
  const [externalStepAction, setExternalStepAction] = useState<{
    mode: "send" | "receive";
    assemblyId: number;
    step: ExternalStageRow;
  } | null>(null);
  const [externalStepBreakdown, setExternalStepBreakdown] = useState<number[]>(
    []
  );
  const [externalStepDate, setExternalStepDate] = useState<Date | null>(
    new Date()
  );
  const [externalStepVendorId, setExternalStepVendorId] = useState<number | null>(
    null
  );
  const [externalStepUnknownVendor, setExternalStepUnknownVendor] =
    useState(false);
  const [externalStepRecordSew, setExternalStepRecordSew] = useState(false);
  const [externalStepError, setExternalStepError] = useState<string | null>(null);
  const [factoryAssemblyId, setFactoryAssemblyId] = useState<number | null>(
    null
  );
  const [costingsExpanded, setCostingsExpanded] = useState(false);
  const reasonLabelById = useMemo(() => {
    const map = new Map<number, string>();
    (defectReasons || []).forEach((r) => {
      if (r?.id != null) map.set(Number(r.id), r.label || `#${r.id}`);
    });
    return map;
  }, [defectReasons]);
  const quantityItemsById = useMemo(() => {
    const map = new Map<number, any>();
    (quantityItems || []).forEach((q: any) => {
      if (q?.assemblyId != null) map.set(Number(q.assemblyId), q);
    });
    return map;
  }, [quantityItems]);
  const defectsByAssembly = useMemo(() => {
    const rows = new Map<
      number,
      Array<{
        stage: string;
        reason: string;
        disposition: string;
        qty: number;
        location: string;
      }>
    >();
    const dispositionLabel = (d: string | null | undefined) => {
      if (!d) return "Review";
      if (d === "review") return "QC Review";
      if (d === "scrap") return "Scrap";
      if (d === "offSpec") return "Off-spec / Donation";
      if (d === "sample") return "Sample";
      return d;
    };
    const locationLabel = (d: string | null | undefined) => {
      if (d === "review") return "review";
      if (d === "scrap") return "scrap";
      if (d === "offSpec") return "off_spec";
      if (d === "sample") return "sample";
      return "";
    };
    activityList.forEach((act: any) => {
      if (act?.kind !== "defect") return;
      const aid = Number(act?.assemblyId);
      if (!Number.isFinite(aid)) return;
      const list = rows.get(aid) || [];
      list.push({
        stage: String(act.stage || "other"),
        reason: reasonLabelById.get(Number(act.defectReasonId)) || "Unspecified",
        disposition: dispositionLabel(act.defectDisposition),
        qty: Number(act.quantity ?? 0) || 0,
        location: locationLabel(act.defectDisposition),
      });
      rows.set(aid, list);
    });
    return rows;
  }, [activityList, reasonLabelById]);

  const rollupByAssembly = rollupsByAssembly || {};

  const externalScopeSummary = useMemo(() => {
    const found = new Set<string>();
    (quantityItems || []).forEach((item: any) => {
      (item?.stageRows || []).forEach((row: any) => {
        if (row?.kind !== "external") return;
        const type = String(row.externalStepType || "").toLowerCase();
        if (type === "wash" || type === "embroidery" || type === "dye") {
          found.add(type);
        } else if (type) {
          found.add(type);
        }
      });
    });
    return Array.from(found.values());
  }, [quantityItems]);

  useEffect(() => {
    if (externalStepFetcher.data?.ok) {
      setExternalStepAction(null);
      setExternalStepError(null);
      setExternalStepBreakdown([]);
      revalidator.revalidate();
    } else if (externalStepFetcher.data?.error) {
      setExternalStepError(String(externalStepFetcher.data.error));
    }
  }, [externalStepFetcher.data, revalidator]);

  const openExternalStepModal = (assemblyId: number, step: ExternalStageRow) => {
    const mode: "send" | "receive" =
      step.status === "NOT_STARTED"
        ? "send"
        : step.status === "IN_PROGRESS"
          ? "receive"
          : "receive";
    const defaultBreakdown = buildExternalStepDefaultBreakdown(assemblyId, step, mode);
    setExternalStepAction({ mode, assemblyId, step });
    setExternalStepBreakdown(defaultBreakdown);
    setExternalStepDate(new Date());
    setExternalStepVendorId(step.vendor?.id ?? null);
    setExternalStepUnknownVendor(false);
    setExternalStepRecordSew(false);
    setExternalStepError(null);
  };

  const setExternalStepMode = (mode: "send" | "receive") => {
    setExternalStepAction((prev) => {
      if (!prev) return prev;
      if (prev.mode === mode) return prev;
      const defaultBreakdown = buildExternalStepDefaultBreakdown(
        prev.assemblyId,
        prev.step,
        mode
      );
      setExternalStepBreakdown(defaultBreakdown);
      setExternalStepRecordSew(false);
      setExternalStepError(null);
      return { ...prev, mode };
    });
  };

  const handleExternalStepBreakdownChange = (
    index: number,
    value: string
  ) => {
    const parsed = value === "" ? 0 : Number(value);
    const sanitized =
      Number.isFinite(parsed) && parsed > 0 ? Number(parsed) : 0;
    setExternalStepBreakdown((prev) => {
      const next = [...(prev || [])];
      next[index] = sanitized;
      return next;
    });
  };

  const handleExternalStepSubmit = () => {
    if (!externalStepAction) return;
    const qtyBreakdown = (externalStepBreakdown || []).map((value) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : 0;
    });
    const qty = qtyBreakdown.reduce((sum, value) => sum + value, 0);
    const vendorId = externalStepVendorId;
    const unknownVendor = externalStepUnknownVendor;
    if (!unknownVendor && !vendorId) {
      setExternalStepError("Vendor is required (or choose Unknown vendor).");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setExternalStepError("Enter at least one unit in the size breakdown.");
      return;
    }
    const fd = new FormData();
    fd.set(
      "_intent",
      externalStepAction.mode === "send"
        ? "externalStep.send"
        : "externalStep.receive"
    );
    fd.set("assemblyId", String(externalStepAction.assemblyId));
    fd.set("externalStepType", externalStepAction.step.externalStepType);
    if (externalStepDate) {
      fd.set("activityDate", externalStepDate.toISOString());
    }
    fd.set("qty", String(qty));
    fd.set("qtyBreakdown", JSON.stringify(qtyBreakdown));
    if (vendorId) fd.set("vendorCompanyId", String(vendorId));
    if (unknownVendor) fd.set("vendorUnknown", "1");
    if (externalStepAction.mode === "send" && externalStepRecordSew) {
      fd.set("recordSewNow", "1");
    }
    externalStepFetcher.submit(fd, { method: "post" });
  };

  const externalStepRollup = externalStepAction
    ? rollupByAssembly[externalStepAction.assemblyId]
    : null;
  const sewMissing =
    externalStepAction?.mode === "send" &&
    (Number(externalStepRollup?.sewGoodQty ?? 0) || 0) <= 0;
  const externalStepVariantLabels = externalStepAction
    ? resolveVariantLabels(externalStepAction.assemblyId)
    : [];
  const externalStepBreakdownEntries = useMemo(() => {
    const len = Math.max(
      externalStepVariantLabels.length,
      externalStepBreakdown.length,
      1
    );
    return Array.from({ length: len }, (_, idx) => {
      const value = externalStepBreakdown[idx];
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    });
  }, [externalStepBreakdown, externalStepVariantLabels.length]);
  const externalStepBreakdownTotal = useMemo(
    () =>
      externalStepBreakdownEntries.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      ),
    [externalStepBreakdownEntries]
  );
  const vendorSelectData = useMemo(() => {
    if (!externalStepAction) return [];
    const baseOptions =
      vendorOptionsByStep?.[externalStepAction.step.externalStepType] || [];
    const map = new Map<number, CompanyOption>();
    baseOptions.forEach((opt) => map.set(opt.value, opt));
    const activeVendor = externalStepAction.step.vendor;
    if (activeVendor && !map.has(activeVendor.id)) {
      map.set(activeVendor.id, {
        value: activeVendor.id,
        label: activeVendor.name?.trim() || `Company ${activeVendor.id}`,
        isSupplier: true,
      });
    }
    return Array.from(map.values()).map((opt) => ({
      value: String(opt.value),
      label: opt.label,
    }));
  }, [externalStepAction, vendorOptionsByStep]);
  const summaryByAssembly = useMemo(() => {
    const map = new Map<
      number,
      {
        ordered: number;
        packed: number;
        defects: number;
        review: number;
        scrap: number;
        offSpec: number;
        sample: number;
      }
    >();
    (assemblies || []).forEach((a) => {
      const item = quantityItemsById.get(a.id);
      const ordered =
        Array.isArray(item?.ordered) && item.ordered.length
          ? item.ordered.reduce((t: number, n: number) => t + (Number(n) || 0), 0)
          : Number((a as any).quantity ?? 0) || 0;
      const packed =
        Array.isArray(item?.pack) && item.pack.length
          ? item.pack.reduce((t: number, n: number) => t + (Number(n) || 0), 0)
          : Number(item?.totals?.pack ?? 0) || 0;
      const defects = (defectsByAssembly.get(a.id) || []).reduce(
        (t, r) => t + (Number(r.qty) || 0),
        0
      );
      const dispSum = (key: string) =>
        (defectsByAssembly.get(a.id) || [])
          .filter((r) => r.location === key)
          .reduce((t, r) => t + (Number(r.qty) || 0), 0);
      map.set(a.id, {
        ordered,
        packed,
        defects,
        review: dispSum("review"),
        scrap: dispSum("scrap"),
        offSpec: dispSum("off_spec"),
        sample: dispSum("sample"),
      });
    });
    return map;
  }, [assemblies, quantityItemsById, defectsByAssembly]);

  const deleteRequiredPhrase = "I AM SO SURE";
  const normalizeCostingActivityUsed = (value?: string | null) => {
    const v = String(value ?? "")
      .toLowerCase()
      .trim();
    if (v === "make") return "finish";
    if (v === "finish") return "finish";
    if (v === "sew") return "sew";
    if (v === "cut") return "cut";
    return "";
  };
  const editForm = useForm<{
    orderedByAssembly: Record<string, number[]>;
    qpu: Record<string, number>;
    activity: Record<string, string>;
    costingDisabled: Record<string, boolean>;
    names: Record<string, string>;
    statusNotes: Record<string, string>;
    statuses: Record<string, string>;
    assemblyTypes: Record<string, string>;
  }>({
    defaultValues: {
      orderedByAssembly: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          (a.qtyOrderedBreakdown || []) as number[],
        ])
      ) as any,
      qpu: Object.fromEntries(
        (assemblies || [])
          .flatMap((a) => a.costings || [])
          .map((c: any) => [String(c.id), Number(c.quantityPerUnit || 0) || 0])
      ) as any,
      activity: Object.fromEntries(
        (assemblies || [])
          .flatMap((a) => a.costings || [])
          .map((c: any) => [
            String(c.id),
            normalizeCostingActivityUsed(c.activityUsed),
          ])
      ) as any,
      costingDisabled: Object.fromEntries(
        (assemblies || [])
          .flatMap((a) => a.costings || [])
          .map((c: any) => [String(c.id), Boolean((c as any).flagIsDisabled)])
      ) as any,
      primaryCostingIds: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          primaryCostingIdByAssembly?.[a.id] ?? (a as any).primaryCostingId ?? null,
        ])
      ) as any,
      names: Object.fromEntries(
        (assemblies || []).map((a) => [String(a.id), String(a.name || "")])
      ) as any,
      statusNotes: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          String((a as any).statusWhiteboard || ""),
        ])
      ) as any,
      statuses: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          normalizeAssemblyState(a.status as string | null) ?? "DRAFT",
        ])
      ) as any,
      assemblyTypes: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          String((a as any).assemblyType || "Prod"),
        ])
      ) as any,
    },
  });
  const assembliesById = useMemo(() => {
    const map = new Map<number, any>();
    (assemblies || []).forEach((asm) => {
      if (asm?.id != null) {
        map.set(Number(asm.id), asm);
      }
    });
    return map;
  }, [assemblies]);
  const resolveHoldContext = (assemblyId: number) => {
    const asm = assembliesById.get(assemblyId);
    const jobState = String(asm?.job?.state || "").toUpperCase();
    if (jobState === "CANCELED") {
      return { label: "Job is canceled", mode: "canceled" } as const;
    }
    const jobHoldOn = Boolean(asm?.job?.jobHoldOn);
    const manualHoldOn = Boolean(asm?.manualHoldOn);
    const effectiveHold = computeEffectiveAssemblyHold({
      jobHoldOn,
      manualHoldOn,
    });
    if (!effectiveHold) return null;
    const label = jobHoldOn && manualHoldOn
      ? "Job + Assembly"
      : jobHoldOn
      ? "Job"
      : "Assembly";
    return { label, mode: "hold" } as const;
  };
  const confirmIfHeld = (
    assemblyId: number,
    onConfirm: () => void
  ): void => {
    const hold = resolveHoldContext(assemblyId);
    if (!hold) {
      onConfirm();
      return;
    }
    modals.openConfirmModal({
      title: hold.mode === "canceled" ? "Job is canceled" : "Assembly is held",
      children: (
        <Text size="sm">
          {hold.mode === "canceled"
            ? "This job is canceled. Creating new activity is blocked by default. Continue anyway?"
            : `This assembly is currently held (${hold.label}). Continue anyway?`}
        </Text>
      ),
      labels: { confirm: "Continue", cancel: "Cancel" },
      confirmProps: { color: hold.mode === "canceled" ? "red" : "orange" },
      onConfirm,
    });
  };

  const handleCostingAction = (
    costingId: number,
    action: "enable" | "disable" | "delete" | "refresh"
  ) => {
    if (!Number.isFinite(costingId)) return;
    if (action === "refresh") {
      const fd = new FormData();
      fd.set("_intent", "costing.refreshProduct");
      fd.set("id", costingId.toString());
      submit(fd, { method: "post" });
      return;
    }
    if (action === "delete") {
      const fd = new FormData();
      fd.set("_intent", `costing.${action}`);
      fd.set("id", costingId.toString());
      submit(fd, { method: "post" });
      return;
    }
    editForm.setValue(
      `costingDisabled.${costingId}` as any,
      action === "disable",
      { shouldDirty: true, shouldTouch: true }
    );
  };
  const modalAssembly =
    (modalAssemblyId != null && assembliesById.get(modalAssemblyId)) ||
    firstAssembly;
  const packModalAssembly =
    (packModalAssemblyId != null && assembliesById.get(packModalAssemblyId)) ||
    null;
  const costingDisabledMap = editForm.watch("costingDisabled") as Record<
    string,
    boolean
  >;
  const quantityItemsByAssemblyId = useMemo(() => {
    const map = new Map<number, QuantityItem>();
    (quantityItems || []).forEach((item) => {
      if (item?.assemblyId != null) {
        map.set(Number(item.assemblyId), item);
      }
    });
    return map;
  }, [quantityItems]);
  const getVariantLabelsForAssembly = (assemblyId: number): string[] => {
    const asm = assembliesById.get(assemblyId);
    if (asm?.variantSet?.variants?.length) {
      return (asm.variantSet.variants as string[]) || [];
    }
    const qtyItem = quantityItemsByAssemblyId.get(assemblyId);
    if (qtyItem?.variants?.labels?.length) {
      return qtyItem.variants.labels;
    }
    return activityVariantLabels || [];
  };
  const trimVariantLabels = (labels: string[]): string[] => {
    let last = -1;
    for (let i = labels.length - 1; i >= 0; i--) {
      const value = (labels[i] || "").toString().trim();
      if (value) {
        last = i;
        break;
      }
    }
    if (last === -1) return [];
    return labels.slice(0, last + 1);
  };
  const resolveActivityTimestamp = (activity: any): number => {
    const rawDate = activity?.activityDate ?? activity?.endTime;
    if (!rawDate) return 0;
    const value = new Date(rawDate as any).getTime();
    return Number.isFinite(value) ? value : 0;
  };
  const groupQtyItemsPayload = useMemo(() => {
    if (!isGroup) return undefined;
    return (assemblies as any[]).map((a: any) => {
      const it = (quantityItems as any[]).find((i) => i.assemblyId === a.id);
      return {
        assemblyId: a.id,
        variants: { labels: it?.variants?.labels || [] },
        ordered: it?.ordered || [],
        cut: it?.cut || [],
      };
    });
  }, [assemblies, isGroup, quantityItems]);
  const activityRows = activityList;
  const modalVariantLabels = modalAssembly?.id
    ? getVariantLabelsForAssembly(modalAssembly.id)
    : activityVariantLabels || [];
  const packModalVariantLabels = packModalAssemblyId
    ? getVariantLabelsForAssembly(packModalAssemblyId)
    : [];
  const modalCostings = useMemo(() => {
    const raw = ((modalAssembly as any)?.costings || []) as any[];
    return raw.map((c: any) => ({
      ...c,
      component: c.product ?? c.component ?? null,
    }));
  }, [modalAssembly]);
  const packModalQuantityItem = packModalAssemblyId
    ? quantityItemsByAssemblyId.get(packModalAssemblyId)
    : undefined;
  const groupAssemblyIds = useMemo(
    () => (assemblies || []).map((a) => a.id),
    [assemblies]
  );
  const baseActivityVariantLabels = useMemo(() => {
    if (activityVariantLabels?.length) {
      return trimVariantLabels(activityVariantLabels);
    }
    for (const assemblyId of groupAssemblyIds) {
      const labels = trimVariantLabels(getVariantLabelsForAssembly(assemblyId));
      if (labels.length) return labels;
    }
    return [];
  }, [
    activityVariantLabels,
    groupAssemblyIds,
    assembliesById,
    quantityItemsByAssemblyId,
  ]);
  const activityVariantHeaders = useMemo(() => {
    const longestBreakdown = activityRows.reduce(
      (len: number, activity: any) => {
        const breakdownLength = Array.isArray(activity?.qtyBreakdown)
          ? activity.qtyBreakdown.length
          : 0;
        return Math.max(len, breakdownLength);
      },
      0
    );
    const columnCount = baseActivityVariantLabels.length
      ? baseActivityVariantLabels.length
      : longestBreakdown;
    if (!columnCount) return [] as string[];
    return Array.from({ length: columnCount }, (_, idx) => {
      const raw = baseActivityVariantLabels[idx];
      return raw && raw.trim() ? raw : `Variant ${idx + 1}`;
    });
  }, [activityRows, baseActivityVariantLabels]);
  const groupedActivities = useMemo(() => {
    const buckets = new Map<string, any[]>();
    for (const activity of activityRows) {
      const rawKey = activity?.groupKey && String(activity.groupKey).trim();
      const key = rawKey
        ? `group:${String(activity.groupKey)}`
        : `activity:${activity.id}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(activity);
      buckets.set(key, bucket);
    }
    const rows = Array.from(buckets.entries()).map(([key, items]) => {
      const sorted = items
        .slice()
        .sort(
          (a, b) => resolveActivityTimestamp(b) - resolveActivityTimestamp(a)
        );
      const representative = sorted[0];
      const assemblyIds = Array.from(
        new Set(
          sorted
            .map((act) => Number(act?.assemblyId))
            .filter((id) => Number.isFinite(id))
        )
      ) as number[];
      const longestBreakdown = sorted.reduce(
        (len, act) =>
          Math.max(
            len,
            Array.isArray(act?.qtyBreakdown) ? act.qtyBreakdown.length : 0
          ),
        0
      );
      const breakdown = Array.from({ length: longestBreakdown }, (_, idx) =>
        sorted.reduce((sum, act) => {
          const value = Array.isArray(act?.qtyBreakdown)
            ? Number(act.qtyBreakdown[idx]) || 0
            : 0;
          return sum + value;
        }, 0)
      );
      return {
        key,
        representative,
        breakdown,
        assemblyIds,
      };
    });
    return rows.sort(
      (a, b) =>
        resolveActivityTimestamp(b.representative) -
        resolveActivityTimestamp(a.representative)
    );
  }, [activityRows]);
  useEffect(() => {
    setModalAssemblyId(firstAssembly?.id ?? null);
  }, [firstAssembly?.id]);
  const watchedStatuses =
    (editForm.watch("statuses") as Record<string, string | undefined>) || {};
  const watchedStatusNotes =
    (editForm.watch("statusNotes") as Record<string, string | undefined>) || {};
  const watchedAssemblyTypes =
    (editForm.watch("assemblyTypes") as Record<string, string | undefined>) ||
    {};
  const resolveStatusValue = (asmId: number) =>
    normalizeAssemblyState(
      watchedStatuses[String(asmId)] ??
        (assembliesById.get(asmId)?.status as string | null)
    ) ?? "DRAFT";
  const resolveStatusNoteValue = (asmId: number) =>
    watchedStatusNotes[String(asmId)] ??
    (assembliesById.get(asmId)?.statusWhiteboard as string | null) ??
    "";
  const applyGroupStatusValue = (value: string) => {
    groupAssemblyIds.forEach((id) => {
      editForm.setValue(`statuses.${id}` as const, value, {
        shouldDirty: true,
        shouldTouch: true,
      });
    });
  };
  const applyGroupStatusNotes = (value: string) => {
    groupAssemblyIds.forEach((id) => {
      editForm.setValue(`statusNotes.${id}` as const, value, {
        shouldDirty: true,
        shouldTouch: true,
      });
    });
  };
  const groupStatusValue =
    isGroup && groupAssemblyIds.length > 0
      ? resolveStatusValue(groupAssemblyIds[0])
      : null;
  const groupWhiteboardValue = isGroup
    ? (() => {
        const seen = new Set<string>();
        const merged: string[] = [];
        groupAssemblyIds.forEach((id) => {
          const rawValue = resolveStatusNoteValue(id) || "";
          const key = rawValue.trim();
          if (key && !seen.has(key)) {
            seen.add(key);
            merged.push(rawValue);
          }
        });
        return merged.join(" | ");
      })()
    : "";
  const canRecordFinishForAssembly = (assemblyId: number) => {
    const totals = quantityItemsByAssemblyId.get(assemblyId)?.totals;
    if (!totals) return false;
    const cut = Number(totals.cut ?? 0) || 0;
    const finish = Number(totals.finish ?? 0) || 0;
    return cut > finish;
  };
  const canRecordPackForAssembly = (assemblyId: number) => {
    const totals = quantityItemsByAssemblyId.get(assemblyId)?.totals;
    if (!totals) return false;
    const finish = Number(totals.finish ?? 0) || 0;
    const pack = Number(totals.pack ?? 0) || 0;
    return finish > pack;
  };
  const assembliesResetKey = useMemo(
    () =>
      (assemblies || [])
        .map((a) =>
          [
            a.id,
            a.status,
            a.name,
            (a as any).statusWhiteboard,
            (a as any).assemblyType,
            (a.qtyOrderedBreakdown || []).join(","),
            (a.costings || [])
              .map(
                (c: any) =>
                  `${c.id}:${c.quantityPerUnit ?? ""}:${c.activityUsed ?? ""}`
              )
              .join("|"),
          ].join("::")
        )
        .join("##"),
    [assemblies]
  );
  useEffect(() => {
    editForm.reset(
      {
        orderedByAssembly: Object.fromEntries(
          (assemblies || []).map((a) => [
            String(a.id),
            (a.qtyOrderedBreakdown || []) as number[],
          ])
        ) as any,
        qpu: Object.fromEntries(
          (assemblies || [])
            .flatMap((a) => a.costings || [])
            .map((c: any) => [
              String(c.id),
              Number(c.quantityPerUnit || 0) || 0,
            ])
        ) as any,
        activity: Object.fromEntries(
          (assemblies || [])
            .flatMap((a) => a.costings || [])
            .map((c: any) => [
              String(c.id),
              normalizeCostingActivityUsed(c.activityUsed),
            ])
        ) as any,
        primaryCostingIds: Object.fromEntries(
          (assemblies || []).map((a) => [
            String(a.id),
            primaryCostingIdByAssembly?.[a.id] ??
              (a as any).primaryCostingId ??
              null,
          ])
        ) as any,
        names: Object.fromEntries(
          (assemblies || []).map((a) => [String(a.id), String(a.name || "")])
        ) as any,
        statusNotes: Object.fromEntries(
          (assemblies || []).map((a) => [
            String(a.id),
            String((a as any).statusWhiteboard || ""),
          ])
        ) as any,
        statuses: Object.fromEntries(
          (assemblies || []).map((a) => [
            String(a.id),
            normalizeAssemblyState(a.status as string | null) ?? "DRAFT",
          ])
        ) as any,
        assemblyTypes: Object.fromEntries(
          (assemblies || []).map((a) => [
            String(a.id),
            String((a as any).assemblyType || "Prod"),
          ])
        ) as any,
      },
      { keepDirty: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembliesResetKey]);

  const saveUpdate = () => {
    const fd = new FormData();
    fd.set("_intent", saveIntent);
    const orderedByAssembly = editForm.getValues("orderedByAssembly");
    if (
      assemblies.length === 1 &&
      saveIntent === "assembly.updateOrderedBreakdown"
    ) {
      const onlyId = String(assemblies[0].id);
      fd.set("orderedArr", JSON.stringify(orderedByAssembly[onlyId] || []));
    } else {
      fd.set("orderedArr", JSON.stringify(orderedByAssembly));
    }
    fd.set("qpu", JSON.stringify(editForm.getValues("qpu")));
    fd.set("activity", JSON.stringify(editForm.getValues("activity")));
    fd.set(
      "primaryCostingIds",
      JSON.stringify(editForm.getValues("primaryCostingIds") || {})
    );
    fd.set("statuses", JSON.stringify(editForm.getValues("statuses")));
    submit(fd, { method: "post" });
  };
  useInitGlobalFormContext(editForm as any, saveUpdate, () =>
    editForm.reset({
      orderedByAssembly: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          (a.qtyOrderedBreakdown || []) as number[],
        ])
      ) as any,
      qpu: Object.fromEntries(
        (assemblies || [])
          .flatMap((a) => a.costings || [])
          .map((c: any) => [String(c.id), Number(c.quantityPerUnit || 0) || 0])
      ) as any,
      activity: Object.fromEntries(
        (assemblies || [])
          .flatMap((a) => a.costings || [])
          .map((c: any) => [
            String(c.id),
            normalizeCostingActivityUsed(c.activityUsed),
          ])
      ) as any,
      statusNotes: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          String((a as any).statusWhiteboard || ""),
        ])
      ) as any,
      statuses: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          normalizeAssemblyState(a.status as string | null) ?? "DRAFT",
        ])
      ) as any,
      assemblyTypes: Object.fromEntries(
        (assemblies || []).map((a) => [
          String(a.id),
          String((a as any).assemblyType || "Prod"),
        ])
      ) as any,
    })
  );

  const sendAssemblyUpdate = (
    assemblyId: number,
    payload: Record<string, string | null | undefined>,
    intentOverride?: string
  ) => {
    const fd = new FormData();
    fd.set(
      "_intent",
      intentOverride ||
        stateChangeIntent ||
        (isGroup ? "assembly.update.fromGroup" : "assembly.update")
    );
    fd.set("assemblyId", String(assemblyId));
    Object.entries(payload).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        fd.set(key, val);
      }
    });
    if (typeof window !== "undefined") {
      fd.set("returnTo", window.location.pathname + window.location.search);
    }
    submit(fd, { method: "post" });
  };
  const sendGroupStateUpdate = (
    payload: Record<string, string | null | undefined>,
    intentOverride?: string
  ) => {
    if (!groupAssemblyIds.length) return;
    const fd = new FormData();
    fd.set("_intent", intentOverride || "assembly.groupState");
    fd.set("assemblyIds", groupAssemblyIds.join(","));
    Object.entries(payload).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        fd.set(key, val);
      }
    });
    if (typeof window !== "undefined") {
      fd.set("returnTo", window.location.pathname + window.location.search);
    }
    submit(fd, { method: "post" });
  };

  const resolveActivityType = (activity: any | null): ActivityModalType => {
    const stage = String(activity?.stage || "").toLowerCase();
    if (stage === "finish" || stage === "make") return "finish";
    if (stage === "pack") return "pack";
    const raw = String(activity?.name || "").toLowerCase();
    if (raw.includes("finish") || raw.includes("make")) return "finish";
    if (raw.includes("pack")) return "pack";
    return "cut";
  };

  const modalActivityType = editActivity
    ? resolveActivityType(editActivity)
    : createActivityType;

  const closeDeleteModal = () => {
    setDeleteActivity(null);
    setDeleteConfirmation("");
  };

  const closeDefectModal = () => {
    setDefectModalOpen(false);
    setDefectEditActivityId(null);
  };

  const resolveCancelEditLabels = () => {
    const labels = cancelEditAssemblyId
      ? trimVariantLabels(getVariantLabelsForAssembly(cancelEditAssemblyId))
      : [];
    const maxLen = Math.max(labels.length, cancelEditBreakdown.length);
    if (!maxLen) return [];
    return Array.from({ length: maxLen }, (_, idx) => labels[idx] || `Variant ${idx + 1}`);
  };

  useEffect(() => {
    if (!defectModalOpen) return;
    const labels = resolveVariantLabels(
      defectAssemblyId ?? firstAssembly?.id ?? null
    );
    if (!labels || labels.length === 0) return;
    setDefectBreakdown((prev) => {
      const next = Array.from({ length: labels.length }, (_, idx) => prev[idx] || 0);
      return next;
    });
  }, [defectModalOpen, defectAssemblyId, firstAssembly?.id]);

  function resolveVariantLabels(assemblyId: number | null) {
    if (!assemblyId) return ["Qty"];
    const labels =
      quantityItemsById.get(assemblyId)?.variants?.labels ||
      firstAssembly?.variantSet?.variants ||
      [];
    return labels && labels.length ? labels : ["Qty"];
  }

  const buildExternalStepDefaultBreakdown = (
    assemblyId: number,
    step: ExternalStageRow,
    mode: "send" | "receive"
  ): number[] => {
    if (!assemblyId) return [];
    const item = quantityItemsByAssemblyId.get(assemblyId);
    if (!item) return [];
    let base: number[] = [];
    if (mode === "send") {
      base = item.sew ? [...item.sew] : [];
    } else {
      const match = (item.stageRows || []).find(
        (
          row
        ): row is Extract<
          StageRow,
          { kind: "external"; externalStepType: ExternalStageRow["externalStepType"] }
        > =>
          row.kind === "external" && row.externalStepType === step.externalStepType
      );
      if (match) {
        base = match.sent.map((sent, idx) =>
          Math.max(sent - (match.received[idx] ?? 0), 0)
        );
      }
    }
    const labels = resolveVariantLabels(assemblyId);
    const len = Math.max(base.length, labels.length, 1);
    return Array.from({ length: len }, (_, idx) => Number(base[idx] ?? 0) || 0);
  };

  const watchedPrimaryCostingIds =
    (editForm.watch("primaryCostingIds") as Record<string, number | null>) ||
    {};
  const currentPrimaryCostingByAssembly = (() => {
    const map = new Map<number, number | null>();
    (assemblies || []).forEach((a) => {
      const aid = Number(a.id);
      const fromForm = watchedPrimaryCostingIds[String(aid)];
      if (fromForm != null) {
        map.set(aid, Number(fromForm));
        return;
      }
      const fromProp =
        primaryCostingIdByAssembly?.[aid] ??
        (a as any).primaryCostingId ??
        null;
      map.set(aid, fromProp != null ? Number(fromProp) : null);
    });
    return Object.fromEntries(map);
  })();

  const costingsSummary = useMemo(() => {
    type Chip = {
      key: string;
      tone: "warning" | "info" | "neutral";
      label: string;
      tooltip: string;
    };
    const warnings: Chip[] = [];
    const neutrals: Chip[] = [];
    const scopes: Chip[] = [];

    const collapse = (
      list: Chip[],
      max: number,
      overflowLabel: (n: number) => string
    ): Chip[] => {
      if (list.length <= max) return list;
      const visible = list.slice(0, max);
      const hidden = list.slice(max);
      visible.push({
        key: `overflow-${visible.length}`,
        tone: "neutral",
        label: overflowLabel(hidden.length),
        tooltip: hidden.map((c) => c.label).join(" · "),
      });
      return visible;
    };

    const aid = Number(firstAssembly?.id ?? 0) || 0;
    const primaryId =
      (aid && currentPrimaryCostingByAssembly[aid] != null
        ? currentPrimaryCostingByAssembly[aid]
        : null) ?? null;
    const assembly = aid ? assembliesById.get(aid) : undefined;
    const costings = (assembly as any)?.costings || [];
    const primary =
      primaryId != null
        ? costings.find((c: any) => Number(c?.id) === Number(primaryId))
        : null;

    if (!primaryId || !primary) {
      warnings.push({
        key: "no-primary",
        tone: "warning",
        label: "No primary fabric",
        tooltip: "No primary fabric costing is set.",
      });
    } else {
      const labelCore =
        primary?.product?.sku ||
        primary?.product?.name ||
        primary?.sku ||
        primary?.name ||
        `#${primaryId}`;
      neutrals.push({
        key: "primary",
        tone: "neutral",
        label: `Primary fabric: ${String(labelCore)}`,
        tooltip: "Primary fabric costing (main fabric).",
      });

      const qpuMissing =
        primary?.quantityPerUnit == null ||
        Number(primary.quantityPerUnit) <= 0 ||
        !Number.isFinite(Number(primary.quantityPerUnit));
      const activityMissing = !String(primary?.activityUsed || "").trim();
      const pricingMissing =
        primary?.unitCost == null ||
        !Number.isFinite(Number(primary.unitCost)) ||
        Number(primary.unitCost) <= 0;
      if (qpuMissing) {
        warnings.push({
          key: "missing-qpu",
          tone: "warning",
          label: "Missing QPU",
          tooltip: "Primary fabric is missing quantity-per-unit (QPU).",
        });
      }
      if (activityMissing) {
        warnings.push({
          key: "missing-activity",
          tone: "warning",
          label: "Missing activity",
          tooltip: "Primary fabric is missing its activity usage (cut/sew/finish).",
        });
      }
      if (pricingMissing) {
        warnings.push({
          key: "missing-pricing",
          tone: "warning",
          label: "Missing price",
          tooltip: "Primary fabric is missing unit cost / price inputs.",
        });
      }
    }

    externalScopeSummary.forEach((type) => {
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      if (type === "wash" || type === "embroidery" || type === "dye") {
        scopes.push({
          key: `scope-${type}`,
          tone: "neutral",
          label,
          tooltip: `${label} scope.`,
        });
      }
    });

    return [
      ...collapse(warnings, 2, (n) => `+${n}`),
      ...neutrals,
      ...collapse(scopes, 2, (n) => `+${n} scope`),
    ];
  }, [
    assembliesById,
    currentPrimaryCostingByAssembly,
    externalScopeSummary,
    firstAssembly?.id,
  ]);

  const computeDefectCaps = (
    assemblyId: number | null,
    stage: string
  ): { arr: number[]; total: number } | null => {
    if (!assemblyId) return null;
    const item = quantityItemsByAssemblyId.get(assemblyId);
    const stats = item?.stageStats;
    if (!stats) return null;
    const cut = (stats.cut?.usableArr as number[]) || [];
    const sew = (stats.sew?.usableArr as number[]) || [];
    const finish = (stats.finish?.usableArr as number[]) || [];
    const pack = (stats.pack?.usableArr as number[]) || [];
    const len = Math.max(cut.length, sew.length, finish.length, pack.length);
    const arr = Array.from({ length: len }, (_, idx) => {
      const c = Number(cut[idx] ?? 0) || 0;
      const s = Number(sew[idx] ?? 0) || 0;
      const f = Number(finish[idx] ?? 0) || 0;
      const p = Number(pack[idx] ?? 0) || 0;
      const stg = stage.toLowerCase();
      if (stg === "cut") return Math.max(0, c - s);
      if (stg === "sew") return Math.max(0, s - f);
      if (stg === "finish") return Math.max(0, f - p);
      if (stg === "pack") return Math.max(0, f);
      return 0;
    });
    const total = arr.reduce((t, n) => t + (Number(n) || 0), 0);
    return { arr, total };
  };

  const openDefectModal = (opts?: { assemblyId?: number | null; activity?: any }) => {
    const targetAssemblyId =
      opts?.assemblyId ?? defectAssemblyId ?? firstAssembly?.id ?? null;
    const labels = resolveVariantLabels(targetAssemblyId);
    const activity = opts?.activity;
    setDefectAssemblyId(targetAssemblyId);
    const stageRaw = String(activity?.stage || "finish").toLowerCase();
    setDefectStage(stageRaw === "make" ? "finish" : stageRaw);
    const disp =
      activity?.defectDisposition && activity.defectDisposition !== "none"
        ? activity.defectDisposition
        : "review";
    setDefectDisposition(String(disp));
    setDefectReasonId(
      activity?.defectReasonId != null ? String(activity.defectReasonId) : ""
    );
    const incomingBreakdown =
      (Array.isArray(activity?.qtyBreakdown)
        ? activity.qtyBreakdown
        : []) as number[];
    const padded =
      labels && labels.length
        ? Array.from({ length: labels.length }, (_, idx) => incomingBreakdown[idx] || 0)
        : incomingBreakdown;
    setDefectBreakdown(padded);
    setDefectNotes(activity?.notes || "");
    setDefectDate(activity?.activityDate ? new Date(activity.activityDate) : new Date());
    setDefectEditActivityId(activity?.id ?? null);
    setDefectModalOpen(true);
  };

  const submitDefect = () => {
    const targetAssemblyId = defectAssemblyId ?? firstAssembly?.id ?? null;
    if (!targetAssemblyId) return;
    const arr = Array.isArray(defectBreakdown)
      ? defectBreakdown.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0))
      : [];
    const qty = arr.reduce((t, n) => t + (Number(n) || 0), 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const fd = new FormData();
    if (defectEditActivityId) {
      fd.set("_intent", "activity.update");
      fd.set("activityId", String(defectEditActivityId));
    } else {
      fd.set("_intent", "activity.create.defect");
    }
    fd.set("assemblyId", String(targetAssemblyId));
    fd.set("stage", defectStage);
    fd.set("quantity", String(qty));
    fd.set("qtyBreakdown", JSON.stringify(arr));
    if (defectDate) fd.set("activityDate", defectDate.toISOString());
    if (defectReasonId) fd.set("defectReasonId", defectReasonId);
    if (defectDisposition) fd.set("defectDisposition", defectDisposition);
    if (defectNotes.trim()) fd.set("notes", defectNotes.trim());
    submit(fd, { method: "post" });
    setDefectModalOpen(false);
    setDefectBreakdown([]);
    setDefectNotes("");
    setDefectEditActivityId(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteActivity || deleteConfirmation !== deleteRequiredPhrase) return;
    const fd = new FormData();
    fd.set("_intent", "activity.delete");
    fd.set("id", String(deleteActivity.id));
    submit(fd, { method: "post" });
    closeDeleteModal();
  };

  const handleRecordCut = (assemblyId: number) => {
    const targetId = assemblyId ?? firstAssembly?.id ?? null;
    if (!targetId) return;
    confirmIfHeld(targetId, () => {
      setModalAssemblyId(targetId);
      setCreateActivityType("cut");
      setEditActivity(null);
      setActivityModalOpen(true);
    });
  };

  const handleRecordFinish = (assemblyId: number) => {
    if (!canRecordFinishForAssembly(assemblyId)) return;
    const targetId = assemblyId ?? firstAssembly?.id ?? null;
    if (!targetId) return;
    confirmIfHeld(targetId, () => {
      setModalAssemblyId(targetId);
      setCreateActivityType("finish");
      setEditActivity(null);
      setActivityModalOpen(true);
    });
  };

  const handleRecordPack = (assemblyId: number) => {
    if (!canRecordPackForAssembly(assemblyId)) return;
    const targetId = assemblyId ?? firstAssembly?.id ?? null;
    if (!targetId) return;
    confirmIfHeld(targetId, () => {
      setPackModalAssemblyId(targetId);
      setPackModalOpen(true);
    });
  };

  const statusControlElements = legacyStatusReadOnly
    ? (() => {
        if (isGroup) {
          const values = (assemblies as any[]).map(
            (a) => normalizeAssemblyState(a.status as string | null) ?? "DRAFT"
          );
          const unique = new Set(values);
          const label =
            unique.size === 1
              ? assemblyStateConfig.states[values[0]]?.label || values[0]
              : "Mixed";
          return [
            <Badge key="legacy-status" variant="light" color="gray">
              Legacy status: {label}
            </Badge>,
          ];
        }
        return (assemblies as any[]).map((a) => {
          const normalizedStatus =
            normalizeAssemblyState(a.status as string | null) ?? "DRAFT";
          const label =
            assemblyStateConfig.states[normalizedStatus]?.label || normalizedStatus;
          return (
            <Badge key={`legacy-status-${a.id}`} variant="light" color="gray">
              Legacy status: {label}
            </Badge>
          );
        });
      })()
    : isGroup
    ? [
        <StateChangeButton
          key="group-status"
          value={groupStatusValue ?? "DRAFT"}
          defaultValue={groupStatusValue ?? "DRAFT"}
          onChange={(v) => applyGroupStatusValue(v)}
          config={assemblyStateConfig}
        />,
      ]
    : (assemblies as any[]).map((a) => {
        const fieldName = `statuses.${a.id}` as const;
        return (
          <Controller
            key={`status-${a.id}`}
            control={editForm.control}
            name={fieldName}
            render={({ field }) => {
              const normalizedStatus =
                normalizeAssemblyState(field.value) ?? "DRAFT";
              return (
                <StateChangeButton
                  value={normalizedStatus}
                  defaultValue={normalizedStatus}
                  onChange={(v) => field.onChange(v)}
                  config={assemblyStateConfig}
                />
              );
            }}
          />
        );
      });

  const statusControlsNode = (
    <Group gap="xs" align="center" wrap="wrap">
      {statusControlElements}
    </Group>
  );

  const whiteboardControl = firstAssembly ? (
    <TextInput
      placeholder="Whiteboard"
      aria-label="Assembly status whiteboard"
      value={
        isGroup
          ? groupWhiteboardValue
          : resolveStatusNoteValue(firstAssembly.id)
      }
      onChange={(e) => {
        const next = e.currentTarget.value;
        if (isGroup) applyGroupStatusNotes(next);
        else {
          editForm.setValue(`statusNotes.${firstAssembly.id}` as const, next, {
            shouldDirty: true,
            shouldTouch: true,
          });
        }
      }}
      onBlur={(e) => {
        const next = e.currentTarget.value;
        if (isGroup) {
          sendGroupStateUpdate({ statusWhiteboard: next });
        } else if (firstAssembly) {
          sendAssemblyUpdate(firstAssembly.id, {
            statusWhiteboard: next || null,
          });
        }
      }}
      style={{ minWidth: 220 }}
    />
  ) : null;

  const statusBarContent = renderStatusBar?.({
    statusControls: statusControlsNode,
    whiteboardControl,
  }) ?? (
    <Card withBorder padding="sm" mb="md">
      <Stack gap="sm">
        {statusControlsNode}
        {whiteboardControl}
      </Stack>
    </Card>
  );

  return (
    <>
      {statusBarContent}

      <Grid>
        {(assemblies || []).map((a) => {
          const item = (quantityItems || []).find((i) => i.assemblyId === a.id);
          if (!item) return null;
          const normalizedStatus = resolveStatusValue(a.id);
          const statusNoteValue = resolveStatusNoteValue(a.id);
          const statusLabel =
            assemblyStateConfig.states[normalizedStatus]?.label ||
            normalizedStatus;
          const assemblyTypeValue =
            watchedAssemblyTypes[String(a.id)] ||
            (a as any).assemblyType ||
            "Prod";
          return (
            <Fragment key={a.id}>
              <Grid.Col span={5}>
                <Card bg="transparent" padding="md">
                  <TextInput
                    label="Name"
                    value={editForm.watch(`names.${a.id}` as const) || ""}
                    onChange={(e) =>
                      editForm.setValue(
                        `names.${a.id}` as const,
                        e.currentTarget.value,
                        { shouldDirty: true, shouldTouch: true }
                      )
                    }
                    onBlur={() => {
                      sendAssemblyUpdate(a.id, {
                        name: editForm.getValues().names[String(a.id)] || "",
                      });
                    }}
                    mod="data-autosize"
                  />
                  <NativeSelect
                    data={assemblyTypeData}
                    label="Assembly Type"
                    value={assemblyTypeValue}
                    onChange={(e) => {
                      editForm.setValue(
                        `assemblyTypes.${a.id}` as const,
                        e.currentTarget.value,
                        { shouldDirty: true, shouldTouch: true }
                      );
                    }}
                    onBlur={(e) => {
                      sendAssemblyUpdate(a.id, {
                        assemblyType: e.currentTarget.value || "Prod",
                      });
                    }}
                  />
                  <Stack gap={4}>
                    <Text size="sm" fw={500}>
                      Product
                    </Text>
                    {((a as any).product?.id || (a as any).productId) ? (
                      <JumpLink
                        to={`/products/${(a as any).product?.id ?? (a as any).productId}`}
                        label={
                          ((a as any).product?.name as string) ||
                          ((a as any).product?.sku as string) ||
                          `Product ${(a as any).productId ?? ""}`
                        }
                      />
                    ) : (
                      <Text>
                        {((a as any).product?.name as string) || "—"}
                      </Text>
                    )}
                  </Stack>
                  <TextInput
                    readOnly
                    value={a.id || ""}
                    label="ID"
                    mod="data-autosize"
                  />
                </Card>
              </Grid.Col>
              <Grid.Col span={7}>
                <Stack gap="sm">
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => setFactoryAssemblyId(a.id)}
                    >
                      Show factory view
                    </Button>
                  </Group>
                  <AssemblyQuantitiesCard
                    variants={item.variants}
                    items={[
                      {
                        label: `Assembly ${a.id}`,
                        assemblyId: a.id,
                        ordered: item.ordered,
                        cut: item.cut,
                        sew: item.sew,
                        finish: item.finish,
                        pack: item.pack,
                        totals: item.totals,
                        stageRows: item.stageRows,
                      },
                    ]}
                    editableOrdered
                    hideInlineActions
                    orderedValue={editForm.watch(
                      `orderedByAssembly.${a.id}` as any
                    )}
                    onChangeOrdered={(arr) =>
                      editForm.setValue(
                        `orderedByAssembly.${a.id}` as any,
                        arr,
                        {
                          shouldDirty: true,
                          shouldTouch: true,
                        }
                      )
                    }
                    actionColumn={{
                      onRecordCut: () => handleRecordCut(a.id),
                      onRecordFinish: () => handleRecordFinish(a.id),
                      recordFinishDisabled: !canRecordFinishForAssembly(a.id),
                      onRecordPack: () => handleRecordPack(a.id),
                      recordPackDisabled: !canRecordPackForAssembly(a.id),
                    }}
                    onExternalSend={(assemblyId, row) =>
                      openExternalStepModal(assemblyId, row)
                    }
                    onExternalReceive={(assemblyId, row) =>
                      openExternalStepModal(assemblyId, row)
                    }
                  />
                </Stack>
              </Grid.Col>
            </Fragment>
          );
        })}
        <Grid.Col span={12} mt="lg">
          <Card withBorder bg="transparent" padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center" wrap="nowrap">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setCostingsExpanded((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCostingsExpanded((v) => !v);
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    overflow: "hidden",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Group gap="sm" wrap="nowrap" style={{ overflow: "hidden" }}>
                    <Title order={4}>Costings</Title>
                    <Group
                      gap={6}
                      wrap="nowrap"
                      style={{ overflow: "hidden", height: 26 }}
                    >
                      {costingsSummary.map((chip) => (
                        <Tooltip
                          key={chip.key}
                          label={chip.tooltip}
                          withArrow
                          multiline
                        >
                          <AxisChip tone={chip.tone}>{chip.label}</AxisChip>
                        </Tooltip>
                      ))}
                    </Group>
                  </Group>
                </div>
                <Group gap="xs" wrap="nowrap">
                  <AddCostingButton
                    products={products || []}
                    jobId={job?.id || 0}
                    assemblyId={firstAssembly?.id || 0}
                  />
                  <Link
                    to={`/jobs/${job?.id || 0}/assembly/${(assemblies || [])
                      .map((a) => a.id)
                      .join(",")}/costings-sheet`}
                    prefetch="intent"
                    style={{ textDecoration: "none" }}
                  >
                    <Button variant="default" size="xs">
                      Open Sheet
                    </Button>
                  </Link>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setCostingsExpanded((v) => !v)}
                  >
                    {costingsExpanded ? "Collapse" : "Expand"}
                  </Button>
                </Group>
              </Group>
            </Card.Section>
          </Card>
          {costingsExpanded ? (
            <AssemblyCostingsTable
              title="Costings"
              actions={null}
              editableCosting
              canEditCosting={(row) => {
                const aid = Number((row.assemblyId as any) || 0) || 0;
                const a = (assemblies as any[]).find((x: any) => x.id === aid);
                const cutTotal = Number((a as any)?.c_qtyCut || 0) || 0;
                const batchTracked = !!row.batchTrackingEnabled;
                return canEditQpuDefault(cutTotal, batchTracked);
              }}
              register={editForm.register}
              fieldNameForQpu={(row) => `qpu.${row.id}`}
              fieldNameForActivityUsed={(row) => `activity.${row.id}`}
              onCostingAction={handleCostingAction}
              primaryCostingIdByAssembly={
                (currentPrimaryCostingByAssembly as any) || undefined
              }
              onSetPrimaryCosting={(costingId, assemblyId) => {
                editForm.setValue(
                  `primaryCostingIds.${assemblyId}` as any,
                  costingId,
                  { shouldDirty: true, shouldTouch: true }
                );
              }}
              common={
                ((assemblies || [])
                  .flatMap((a) =>
                    buildCostingRows({
                      assemblyId: a.id,
                      costings: (a.costings || []) as any,
                      requiredInputs: {
                        qtyOrdered: (a as any).c_qtyOrdered ?? 0,
                        qtyCut: (a as any).c_qtyCut ?? 0,
                      },
                      priceMultiplier: Number(priceMultiplier || 1) || 1,
                      costingStats: costingStats as any,
                    })
                  )
                  .map((row: any) => ({
                    ...row,
                    flagIsDisabled:
                      costingDisabledMap?.[String(row.id)] ??
                      row.flagIsDisabled,
                  })) || []) as any
              }
              accordionByProduct
            />
          ) : null}
        </Grid.Col>
        {/* Activity section */}
        <Grid.Col span={12} mt="lg">
          <Card withBorder bg="transparent" padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Title order={4}>Activity History</Title>
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => {
                    openDefectModal({ assemblyId: firstAssembly?.id ?? null });
                  }}
                >
                  Record Defect
                </Button>
              </Group>
            </Card.Section>
            <Card.Section>
              {groupedActivities.length ? (
                <Table withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Activity</Table.Th>
                      <Table.Th>Assembly</Table.Th>
                      {activityVariantHeaders.map(
                        (label: string, idx: number) => (
                          <Table.Th ta="center" key={`group-vcol-${idx}`}>
                            {label || `${idx + 1}`}
                          </Table.Th>
                        )
                      )}
                      <Table.Th>Notes</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {groupedActivities.map((group) => {
                      const { representative, breakdown, assemblyIds, key } =
                        group;
                      const assemblyLabel = assemblyIds.length
                        ? assemblyIds.map((id) => `A${id}`).join(", ")
                        : "—";
                      return (
                        <Table.Tr key={key}>
                          <Table.Td>{representative?.id}</Table.Td>
                          <Table.Td>
                            {representative?.activityDate
                              ? new Date(
                                  representative.activityDate
                                ).toLocaleString()
                              : representative?.endTime
                              ? new Date(
                                  representative.endTime
                                ).toLocaleString()
                              : ""}
                          </Table.Td>
                          <Table.Td>
                            {(() => {
                              const stageRaw =
                                representative?.stage != null
                                  ? String(representative.stage).trim()
                                  : "";
                              if (stageRaw) return stageRaw.toUpperCase();
                              const kindRaw =
                                representative?.kind != null
                                  ? String(representative.kind).trim()
                                  : "";
                              const actionRaw =
                                representative?.action != null
                                  ? String(representative.action).trim()
                                  : "";
                              if (kindRaw && actionRaw) {
                                return `${kindRaw}_${actionRaw}`.toUpperCase();
                              }
                              if (kindRaw) return kindRaw.toUpperCase();
                              if (actionRaw) return actionRaw.toUpperCase();
                              return representative?.name || "Activity";
                            })()}
                          </Table.Td>
                          <Table.Td>{assemblyLabel}</Table.Td>
                          {activityVariantHeaders.map(
                            (_label: string, idx: number) => (
                              <Table.Td ta="center" key={`${key}-qty-${idx}`}>
                                {breakdown[idx] ? breakdown[idx] : ""}
                              </Table.Td>
                            )
                          )}
                          <Table.Td>
                            {(() => {
                              const note = representative?.notes;
                              const createdBy = representative?.createdBy;
                              const createdAt = representative?.createdAt;
                              const metaParts = [
                                createdBy ? `by ${createdBy}` : "",
                                createdAt
                                  ? new Date(createdAt).toLocaleString()
                                  : "",
                              ].filter(Boolean);
                              if (!note && metaParts.length === 0) {
                                return (
                                  <Text size="xs" c="dimmed">
                                    —
                                  </Text>
                                );
                              }
                              return (
                                <Stack gap={2}>
                                  {note ? (
                                    <Text size="xs" lineClamp={2}>
                                      {note}
                                    </Text>
                                  ) : null}
                                  {metaParts.length ? (
                                    <Text size="xs" c="dimmed">
                                      {metaParts.join(" · ")}
                                    </Text>
                                  ) : null}
                                </Stack>
                              );
                            })()}
                          </Table.Td>
                          <Table.Td width={60}>
                            <Menu
                              withinPortal
                              position="bottom-end"
                              shadow="sm"
                            >
                              <Menu.Target>
                                <ActionIcon
                                  variant="subtle"
                                  aria-label="Activity actions"
                                >
                                  <IconMenu2 size={16} />
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item
                                  onClick={() => {
                                    const targetAssemblyId =
                                      assemblyIds[0] ||
                                      Number(representative?.assemblyId) ||
                                      firstAssembly?.id ||
                                      null;
                                    const stage = String(
                                      representative?.stage || ""
                                    ).toLowerCase();
                                    if (stage === "cancel") {
                                      const labels = trimVariantLabels(
                                        getVariantLabelsForAssembly(
                                          targetAssemblyId ?? 0
                                        )
                                      );
                                      const breakdown = Array.isArray(
                                        representative?.qtyBreakdown
                                      )
                                        ? (representative.qtyBreakdown as number[])
                                        : [];
                                      const effectiveLen = Math.max(
                                        labels.length,
                                        breakdown.length
                                      );
                                      const normalized = Array.from(
                                        { length: effectiveLen },
                                        (_, idx) => Number(breakdown[idx] ?? 0) || 0
                                      );
                                      setCancelEditActivity(representative);
                                      setCancelEditAssemblyId(targetAssemblyId);
                                      setCancelEditBreakdown(normalized);
                                      setCancelEditReason(
                                        String(representative?.notes || "")
                                      );
                                      setCancelEditDate(
                                        representative?.activityDate
                                          ? new Date(representative.activityDate)
                                          : new Date()
                                      );
                                      setCancelEditOpen(true);
                                    } else if (
                                      representative?.kind === "defect"
                                    ) {
                                      openDefectModal({
                                        assemblyId: targetAssemblyId,
                                        activity: representative,
                                      });
                                    } else {
                                      setModalAssemblyId(targetAssemblyId);
                                      setEditActivity(representative);
                                      setActivityModalOpen(true);
                                    }
                                  }}
                                >
                                  Edit
                                </Menu.Item>
                                <Menu.Item
                                  color="red"
                                  onClick={() => {
                                    setDeleteActivity(representative);
                                    setDeleteConfirmation("");
                                  }}
                                >
                                  Delete
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text c="dimmed">No activities recorded yet.</Text>
              )}
            </Card.Section>
          </Card>
        </Grid.Col>
      </Grid>

      <HotkeyAwareModalRoot
        opened={externalStepAction != null}
        onClose={() => setExternalStepAction(null)}
        centered
        size="lg"
      >
        <Modal.Overlay />
          <Modal.Content>
          <Modal.Header>
            <Group justify="space-between" w="100%">
              <Stack gap={2} style={{ overflow: "hidden", minWidth: 0 }}>
                <Title order={5}>
                  {externalStepAction?.mode === "send" ? "Send out" : "Receive in"} –{" "}
                  {externalStepAction?.step.label || "External step"}
                </Title>
                {externalStepAction ? (
                  <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Vendor:{" "}
                    {externalStepAction.step.vendor?.name ||
                      (externalStepAction.step.vendor?.id
                        ? `Vendor ${externalStepAction.step.vendor.id}`
                        : "—")}
                  </Text>
                ) : null}
              </Stack>
            </Group>
          </Modal.Header>
          <Modal.Body>
            <Stack gap="sm">
              {externalStepAction?.step.status === "IN_PROGRESS" ? (
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={500}>
                    Mode
                  </Text>
                  <SegmentedControl
                    size="xs"
                    value={externalStepAction?.mode}
                    onChange={(val) =>
                      setExternalStepMode(val === "send" ? "send" : "receive")
                    }
                    data={[
                      { label: "Send out", value: "send" },
                      { label: "Receive in", value: "receive" },
                    ]}
                  />
                </Group>
              ) : null}
              {sewMissing ? (
                <Alert color="yellow" title="Sew missing">
                  <Stack gap="xs">
                    <Text size="sm">
                      This assembly has no Sew recorded. You can continue, but
                      the step will be marked low confidence.
                    </Text>
                    <Checkbox
                      label="Record Sew now for the same qty"
                      checked={externalStepRecordSew}
                      onChange={(e) =>
                        setExternalStepRecordSew(e.currentTarget.checked)
                      }
                    />
                  </Stack>
                </Alert>
              ) : null}
              {externalStepError ? (
                <Text size="sm" c="red">
                  {externalStepError}
                </Text>
              ) : null}
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={500}>
                    Size breakdown
                  </Text>
                  <Text size="xs" c="dimmed">
                    Total units: {externalStepBreakdownTotal}
                  </Text>
                </Group>
                <Table
                  withColumnBorders
                  withTableBorder
                  style={{ tableLayout: "fixed" }}
                >
                  <Table.Thead>
                    <Table.Tr>
                      {externalStepBreakdownEntries.map((_value, idx) => (
                        <Table.Th
                          key={`ext-head-${idx}`}
                          ta="center"
                          style={{ width: 72 }}
                        >
                          {externalStepVariantLabels[idx] ||
                            `Variant ${idx + 1}`}
                        </Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      {externalStepBreakdownEntries.map((value, idx) => (
                        <Table.Td
                          key={`ext-cell-${idx}`}
                          p={0}
                          ta="center"
                          style={{ width: 72 }}
                        >
                          <TextInput
                            type="number"
                            variant="unstyled"
                            inputMode="numeric"
                            value={String(value ?? 0)}
                            onChange={(e) =>
                              handleExternalStepBreakdownChange(
                                idx,
                                e.currentTarget.value
                              )
                            }
                            styles={{
                              input: {
                                width: "100%",
                                height: "100%",
                                textAlign: "center",
                                padding: 0,
                                margin: 0,
                                outline: "none",
                              },
                            }}
                          />
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Stack>
              <DatePickerInput
                label="Date"
                value={externalStepDate}
                onChange={setExternalStepDate}
              />
              <Group grow align="flex-end">
                <Select
                  label="Vendor"
                  placeholder="Select vendor"
                  data={vendorSelectData}
                  searchable
                  clearable
                  value={externalStepVendorId ? String(externalStepVendorId) : null}
                  onChange={(val) => {
                    setExternalStepVendorId(
                      val == null || val === "" ? null : Number(val)
                    );
                    if (val) setExternalStepUnknownVendor(false);
                  }}
                  disabled={externalStepUnknownVendor}
                />
                <Checkbox
                  label="Unknown vendor (allow)"
                  checked={externalStepUnknownVendor}
                  onChange={(e) => {
                    const next = e.currentTarget.checked;
                    setExternalStepUnknownVendor(next);
                    if (next) setExternalStepVendorId(null);
                  }}
                />
              </Group>
              <Group justify="flex-end" mt="sm">
                <Button
                  variant="default"
                  onClick={() => setExternalStepAction(null)}
                  disabled={externalStepFetcher.state !== "idle"}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExternalStepSubmit}
                  loading={externalStepFetcher.state !== "idle"}
                >
                  {externalStepAction?.mode === "send"
                    ? "Send out"
                    : "Receive in"}
                </Button>
              </Group>
            </Stack>
          </Modal.Body>
        </Modal.Content>
      </HotkeyAwareModalRoot>

      <Modal
        opened={factoryAssemblyId != null}
        onClose={() => setFactoryAssemblyId(null)}
        size="xl"
        title={
          factoryAssemblyId
            ? `Factory view — Assembly ${factoryAssemblyId}`
            : "Factory view"
        }
        centered
      >
        {factoryAssemblyId ? (
          (() => {
            const item = quantityItemsById.get(factoryAssemblyId);
            const variants = item?.variants?.labels || [];
            const stageStats = item?.stageStats || {};
            const defectRows = defectsByAssembly.get(factoryAssemblyId) || [];
            const summary = summaryByAssembly.get(factoryAssemblyId);
            const usableArrMap: Record<string, number[]> = {
              cut: item?.cut || [],
              sew: item?.sew || [],
              finish: item?.finish || [],
              pack: item?.pack || [],
            };
            const sumArray = (arr?: number[]) =>
              (arr || []).reduce((t, n) => t + (Number(n) || 0), 0);
            const orderRows = [
              {
                label: "ORDER (ORIG)",
                arr: item?.orderedRaw || [],
                total: sumArray(item?.orderedRaw),
                highlight: false,
              },
              {
                label: "CANCELED",
                arr: item?.canceled || [],
                total: sumArray(item?.canceled),
                highlight: false,
              },
              {
                label: "ORDER (NET)",
                arr: item?.ordered || [],
                total: sumArray(item?.ordered),
                highlight: true,
              },
            ];
            const usableTotalMap: Record<string, number | undefined> = {
              cut: item?.totals?.cut,
              sew: item?.totals?.sew,
              finish: item?.totals?.finish,
              pack: item?.totals?.pack,
            };
            const factoryRows = (
              ["cut", "sew", "finish", "pack"] as const
            ).flatMap((stage) => {
                const stats = stageStats?.[stage];
                if (!stats) return [];
                const label = stage.toUpperCase();
                const attemptsArr = stats.attemptsArr || [];
                const defectArr = stats.defectArr || [];
                const usableArr = usableArrMap[stage] || stats.usableArr || [];
                return [
                  {
                    label: `${label} Attempts`,
                    arr: attemptsArr,
                    total: stats.attemptsTotal,
                    highlight: false,
                  },
                  {
                    label: `${label} Defects`,
                    arr: defectArr,
                    total: stats.defectTotal,
                    highlight: false,
                  },
                  {
                    label: `${label} Usable`,
                    arr: usableArr,
                    total: usableTotalMap[stage] ?? stats.usableTotal,
                    highlight: true,
                  },
                ];
              }
            );
            const rowsToRender = [...orderRows, ...factoryRows];
            return (
              <Stack gap="md">
                <Card withBorder padding="sm">
                  <Card.Section inheritPadding py="xs">
                    <Group justify="space-between" align="center">
                      <Title order={6} fw={600}>
                        Factory detail
                      </Title>
                      {summary ? (
                        <Text size="sm" c="dimmed">
                          {summary.ordered} ordered · {summary.packed} packed/shippable
                          {summary.review
                            ? ` · ${summary.review} in QC review`
                            : ""}
                          {summary.scrap ? ` · ${summary.scrap} scrapped` : ""}
                          {summary.offSpec
                            ? ` · ${summary.offSpec} off-spec/donation`
                            : ""}
                          {summary.sample ? ` · ${summary.sample} samples` : ""}
                        </Text>
                      ) : null}
                    </Group>
                  </Card.Section>
                  <Table withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Type</Table.Th>
                        {variants.map((l: string, idx: number) => (
                          <Table.Th ta="center" key={`factory-h-${idx}`}>
                            {l || idx + 1}
                          </Table.Th>
                        ))}
                        <Table.Th>Total</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {rowsToRender.map((row, idx) => (
                        <Table.Tr
                          key={`${row.label}-${row.stage || row.kind || idx}`}
                          style={
                            row.highlight
                              ? { backgroundColor: "#f6f7fb", fontWeight: 600 }
                              : undefined
                          }
                        >
                          <Table.Td>{row.label}</Table.Td>
                          {variants.map((_l: string, idx: number) => (
                            <Table.Td ta="center" key={`${row.label}-${idx}`}>
                              {row.arr?.[idx] ? row.arr[idx] : "∙"}
                            </Table.Td>
                          ))}
                          <Table.Td>{row.total ?? "∙"}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>

                {defectRows.length ? (
                  <Card withBorder padding="sm">
                    <Card.Section inheritPadding py="xs">
                      <Title order={6} fw={600}>
                        Defect breakdown
                      </Title>
                    </Card.Section>
                    <Table withColumnBorders>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Stage</Table.Th>
                          <Table.Th>Reason</Table.Th>
                          <Table.Th>Disposition</Table.Th>
                          <Table.Th>Qty</Table.Th>
                          <Table.Th>Location</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {defectRows.map((row, idx) => (
                          <Table.Tr key={`defect-${idx}`}>
                            <Table.Td>{row.stage}</Table.Td>
                            <Table.Td>{row.reason}</Table.Td>
                            <Table.Td>{row.disposition}</Table.Td>
                            <Table.Td>{row.qty}</Table.Td>
                            <Table.Td>{row.location || "—"}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Card>
                ) : null}
              </Stack>
            );
          })()
        ) : (
          <Text c="dimmed">Select an assembly to view details.</Text>
        )}
      </Modal>

      {/* Activity Modals */}
      {modalAssembly && (
        <AssemblyActivityModal
          opened={activityModalOpen}
          onClose={() => {
            setActivityModalOpen(false);
            setEditActivity(null);
          }}
          assembly={modalAssembly}
          productVariantSet={{ variants: modalVariantLabels } as any}
          groupQtyItems={
            !editActivity && isGroup ? (groupQtyItemsPayload as any) : undefined
          }
          costings={modalCostings as any}
          activityType={modalActivityType}
          mode={editActivity ? "edit" : "create"}
          activityId={editActivity?.id ?? undefined}
          initialDate={
            editActivity?.activityDate || editActivity?.endTime || null
          }
          initialBreakdown={(editActivity?.qtyBreakdown as any) || null}
          initialConsumption={
            editActivity
              ? (() => {
                  return activityConsumptionMap?.[editActivity.id] ?? undefined;
                })()
              : undefined
          }
          packReference={
            editActivity
              ? packActivityReferences?.[editActivity.id] || null
              : null
          }
          overrideIntent={
            !editActivity && isGroup
              ? modalActivityType === "finish"
                ? "group.activity.create.finish"
                : "group.activity.create.cut"
              : undefined
          }
          extraFields={
            !editActivity && isGroup
              ? {
                  activityType: modalActivityType,
                  assemblyIds: groupAssemblyIds.join(","),
                  groupId: groupContext?.groupId || 0,
                  jobId: groupContext?.jobId || 0,
                }
              : undefined
          }
        />
      )}
      <Modal
        opened={cancelEditOpen}
        onClose={() => {
          setCancelEditOpen(false);
          setCancelEditActivity(null);
          setCancelEditAssemblyId(null);
          setCancelEditBreakdown([]);
          setCancelEditReason("");
        }}
        title={
          cancelEditActivity
            ? `Edit cancel - A${cancelEditActivity.assemblyId ?? ""}`
            : "Edit cancel"
        }
        size="xl"
        centered
      >
        <Stack>
          <DatePickerInput
            label="Date"
            value={cancelEditDate}
            onChange={setCancelEditDate}
            size="xs"
          />
          {resolveCancelEditLabels().length ? (
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {resolveCancelEditLabels().map((label, idx) => (
                    <Table.Th key={`cancel-edit-h-${idx}`} ta="center">
                      {label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {resolveCancelEditLabels().map((_label, idx) => (
                    <Table.Td key={`cancel-edit-${idx}`}>
                      <TextInput
                        w="60px"
                        styles={{ input: { textAlign: "center" } }}
                        type="number"
                        value={cancelEditBreakdown[idx] ?? 0}
                        onChange={(e) => {
                          const v =
                            e.currentTarget.value === ""
                              ? 0
                              : Number(e.currentTarget.value);
                          setCancelEditBreakdown((prev) =>
                            prev.map((x, i) =>
                              i === idx ? (Number.isFinite(v) ? v | 0 : 0) : x
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
              No size breakdown available for this cancel.
            </Text>
          )}
          <Textarea
            label="Reason"
            placeholder="Why is this assembly being canceled?"
            value={cancelEditReason}
            onChange={(e) => setCancelEditReason(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setCancelEditOpen(false)}>
              Close
            </Button>
            <Button
              color="red"
              disabled={!cancelEditReason.trim()}
              onClick={() => {
                if (!cancelEditActivity) return;
                const fd = new FormData();
                fd.set("_intent", "activity.update");
                fd.set("activityId", String(cancelEditActivity.id));
                fd.set(
                  "qtyBreakdown",
                  JSON.stringify(cancelEditBreakdown || [])
                );
                fd.set("notes", cancelEditReason.trim());
                if (cancelEditDate) {
                  fd.set("activityDate", cancelEditDate.toISOString());
                }
                submit(fd, { method: "post" });
                setCancelEditOpen(false);
                setCancelEditActivity(null);
                setCancelEditAssemblyId(null);
                setCancelEditBreakdown([]);
                setCancelEditReason("");
              }}
            >
              Save cancel
            </Button>
          </Group>
        </Stack>
      </Modal>
      {packModalAssembly && (
        <AssemblyPackModal
          opened={packModalOpen}
          onClose={() => {
            setPackModalOpen(false);
            setPackModalAssemblyId(null);
          }}
          assembly={packModalAssembly}
          variantLabels={packModalVariantLabels}
          quantityItem={packModalQuantityItem}
          stockLocationName={packContext?.stockLocation?.name ?? null}
          openBoxes={packContext?.openBoxes ?? []}
        />
      )}
      <Modal
        opened={!!deleteActivity}
        onClose={closeDeleteModal}
        title="Delete Activity"
        centered
      >
        <Stack gap="sm">
          <Text>
            To permanently delete activity {deleteActivity?.id}, type{" "}
            <strong>{deleteRequiredPhrase}</strong> below.
          </Text>
          <TextInput
            placeholder={deleteRequiredPhrase}
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.currentTarget.value)}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={deleteConfirmation !== deleteRequiredPhrase}
              onClick={handleConfirmDelete}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={defectModalOpen}
        onClose={closeDefectModal}
        title={defectEditActivityId ? "Edit Defect" : "Record Defect"}
        centered
        size="lg"
      >
        {(() => {
          const variantLabels = resolveVariantLabels(
            defectAssemblyId ?? firstAssembly?.id ?? null
          );
          const caps =
            computeDefectCaps(
              defectAssemblyId ?? firstAssembly?.id ?? null,
              defectStage
            ) || null;
          const capsArr =
            caps?.arr ||
            Array.from({ length: variantLabels.length }, () => 0);
          const capTotal = caps?.total ?? 0;
          const totalQty =
            defectBreakdown.reduce(
              (t, n) => t + (Number(n) || 0),
              0
            ) || 0;
          return (
        <Stack gap="md">
          <Group grow gap="md">
            <Select
              label="Stage"
              data={[
                { value: "cut", label: "Cut" },
                { value: "sew", label: "Sew" },
                { value: "finish", label: "Finish" },
                { value: "pack", label: "Pack" },
                { value: "qc", label: "QC" },
                { value: "other", label: "Other" },
              ]}
              value={defectStage}
              onChange={(val) => setDefectStage(val || "cut")}
            />
            <Select
              label="Disposition"
              data={[
                { value: "review", label: "Set aside for QC review" },
                { value: "scrap", label: "Scrap" },
                { value: "offSpec", label: "Off-spec / Donation" },
                { value: "sample", label: "Sample" },
              ]}
              value={defectDisposition}
              onChange={(val) => setDefectDisposition(val || "review")}
            />
          </Group>
          <Group grow gap="md">
            {isGroup ? (
              <Select
                label="Assembly"
                data={(assemblies || []).map((a) => ({
                  value: String(a.id),
                  label: `Assembly ${a.id}`,
                }))}
                value={defectAssemblyId ? String(defectAssemblyId) : undefined}
                onChange={(val) =>
                  setDefectAssemblyId(
                    val ? Number(val) : firstAssembly?.id ?? null
                  )
                }
              />
            ) : (
              <TextInput
                label="Assembly"
                value={
                  defectAssemblyId
                    ? `Assembly ${defectAssemblyId}`
                    : `Assembly ${firstAssembly?.id ?? ""}`
                }
                readOnly
              />
            )}
            <DatePickerInput
              label="Date"
              value={defectDate}
              onChange={(value) => setDefectDate(value)}
              valueFormat="YYYY-MM-DD"
            />
          </Group>
          <Select
            label="Defect Reason"
            placeholder="Select reason"
            data={(defectReasons || []).map((r) => ({
              value: String(r.id),
              label: r.label || `#${r.id}`,
            }))}
            value={defectReasonId || undefined}
            onChange={(val) => setDefectReasonId(val || "")}
            clearable
          />
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Title order={6}>Quantity breakdown</Title>
              <Text size="sm" c="dimmed">
                Total: {totalQty} {capTotal ? `· Max available: ${capTotal}` : ""}
              </Text>
            </Group>
            <Table withColumnBorders withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  {variantLabels.map((label: string, idx: number) => (
                  <Table.Th ta="center" key={`defect-head-${idx}`} py={2}>
                    {label || idx + 1}
                  </Table.Th>
                ))}
              </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {variantLabels.map((_label: string, idx: number) => {
                    const cap = Number(capsArr[idx] ?? 0) || 0;
                    const currentVal =
                      Number.isFinite(defectBreakdown[idx])
                        ? Number(defectBreakdown[idx])
                        : 0;
                    const displayVal = currentVal ? String(currentVal) : "";
                    const disabled = cap <= 0;
                    return (
                      <Table.Td p={0} ta="center" key={`defect-cell-${idx}`}>
                        <TextInput
                          type="number"
                          variant="unstyled"
                          inputMode="numeric"
                          disabled={disabled}
                          value={displayVal}
                          placeholder={cap ? undefined : ""}
                          onChange={(e) => {
                            if (disabled) return;
                            const rawVal = Number(e.currentTarget.value);
                            const val = Number.isFinite(rawVal)
                              ? Math.max(0, Math.min(rawVal, cap))
                              : 0;
                            setDefectBreakdown((prev) => {
                              const next = [...prev];
                              next[idx] = val;
                              return next;
                            });
                          }}
                          styles={{
                            input: {
                              textAlign: "center",
                              padding: "8px 4px",
                              opacity: disabled ? 0.5 : 1,
                              cursor: disabled ? "not-allowed" : "text",
                            },
                          }}
                        />
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Stack>
          <Textarea
            label="Notes"
            minRows={2}
            value={defectNotes}
            onChange={(e) => setDefectNotes(e.currentTarget.value)}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeDefectModal}>
              Cancel
            </Button>
            <Button onClick={submitDefect}>Save</Button>
          </Group>
        </Stack>
          );
        })()}
      </Modal>
    </>
  );
}

function AddCostingButton({
  products,
  jobId,
  assemblyId,
}: {
  products: Array<{ id: number; sku: string | null; name: string | null }>;
  jobId: number;
  assemblyId: number;
}) {
  const submit = useSubmit();
  const [opened, setOpened] = useState(false);
  const [q, setQ] = useState("");
  const [quantityPerUnit, setQuantityPerUnit] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      `${p.sku ?? ""} ${p.name ?? ""}`.toLowerCase().includes(s)
    );
  }, [products, q]);
  return (
    <>
      <Button variant="default" onClick={() => setOpened(true)}>
        Add Costing
      </Button>
      <Card withBorder padding={0} style={{ display: "none" }} />
      <Text style={{ display: "none" }} />
      <HotkeyAwareModalRoot
        opened={opened}
        onClose={() => setOpened(false)}
        centered
        size="xl"
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Group justify="space-between" w="100%">
              <Title order={5}>Add Costing</Title>
            </Group>
          </Modal.Header>
          <Modal.Body>
            <Stack>
              <TextInput
                placeholder="Search products..."
                value={q}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setQ(e.currentTarget.value)
                }
              />
              <Group grow>
                <TextInput
                  label="Qty / Unit"
                  type="number"
                  value={quantityPerUnit}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setQuantityPerUnit(e.currentTarget.value)
                  }
                />
                <TextInput
                  label="Unit Cost"
                  type="number"
                  value={unitCost}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setUnitCost(e.currentTarget.value)
                  }
                />
              </Group>
              <div style={{ maxHeight: 360, overflow: "auto" }}>
                {filtered.map((p) => (
                  <Group
                    key={p.id}
                    py={6}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "costing.create");
                      fd.set("productId", String(p.id));
                      if (quantityPerUnit !== "")
                        fd.set("quantityPerUnit", quantityPerUnit);
                      if (unitCost !== "") fd.set("unitCost", unitCost);
                      submit(fd, { method: "post" });
                      setOpened(false);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <Text w={60}>{p.id}</Text>
                    <Text w={160}>{p.sku}</Text>
                    <Text style={{ flex: 1 }}>{p.name}</Text>
                  </Group>
                ))}
              </div>
            </Stack>
          </Modal.Body>
        </Modal.Content>
      </HotkeyAwareModalRoot>
    </>
  );
}
