import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  NativeSelect,
  Select,
  Textarea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconMenu2 } from "@tabler/icons-react";
import { HotkeyAwareModalRoot } from "~/base/hotkeys/HotkeyAwareModal";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { useInitGlobalFormContext } from "@aa/timber";
import { useSubmit } from "@remix-run/react";
import { AssemblyQuantitiesCard } from "~/modules/job/components/AssemblyQuantitiesCard";
import { AssemblyCostingsTable } from "~/modules/job/components/AssemblyCostingsTable";
import { Link } from "@remix-run/react";
import {
  buildCostingRows,
  canEditQpuDefault,
} from "~/modules/job/services/costingsView";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { assemblyStateConfig } from "~/base/state/configs";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";
import { AssemblyActivityModal } from "~/components/AssemblyActivityModal";
import { AssemblyPackModal } from "~/modules/job/components/AssemblyPackModal";
import type { PackBoxSummary } from "~/modules/job/types/pack";

export type QuantityItem = {
  assemblyId: number;
  variants: { labels: string[]; numVariants: number };
  ordered: number[];
  cut: number[];
  make: number[];
  pack: number[];
  totals: { cut: number; make: number; pack: number };
};

type MinimalCosting = Parameters<
  typeof buildCostingRows
>[0]["costings"][number];

type ActivityModalType = "cut" | "make" | "pack";

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
  } = props;
  const activityList = activitiesProp || [];
  const submit = useSubmit();
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
  const [defectStage, setDefectStage] = useState<string>("cut");
  const [defectBreakdown, setDefectBreakdown] = useState<number[]>([]);
  const [defectReasonId, setDefectReasonId] = useState<string>("");
  const [defectDisposition, setDefectDisposition] = useState<string>("review");
  const [defectDate, setDefectDate] = useState<Date | null>(new Date());
  const [defectNotes, setDefectNotes] = useState<string>("");
  const [defectEditActivityId, setDefectEditActivityId] = useState<
    number | null
  >(null);
  const [factoryAssemblyId, setFactoryAssemblyId] = useState<number | null>(
    null
  );
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
            String(c.activityUsed ?? "").toLowerCase(),
          ])
      ) as any,
      costingDisabled: Object.fromEntries(
        (assemblies || [])
          .flatMap((a) => a.costings || [])
          .map((c: any) => [String(c.id), Boolean((c as any).flagIsDisabled)])
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

  const handleCostingAction = (
    costingId: number,
    action: "enable" | "disable" | "delete"
  ) => {
    if (!Number.isFinite(costingId)) return;
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
  const canRecordMakeForAssembly = (assemblyId: number) => {
    const totals = quantityItemsByAssemblyId.get(assemblyId)?.totals;
    if (!totals) return false;
    const cut = Number(totals.cut ?? 0) || 0;
    const make = Number(totals.make ?? 0) || 0;
    return cut > make;
  };
  const canRecordPackForAssembly = (assemblyId: number) => {
    const totals = quantityItemsByAssemblyId.get(assemblyId)?.totals;
    if (!totals) return false;
    const make = Number(totals.make ?? 0) || 0;
    const pack = Number(totals.pack ?? 0) || 0;
    return make > pack;
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
              String(c.activityUsed ?? "").toLowerCase(),
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
            String(c.activityUsed ?? "").toLowerCase(),
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
    const raw = String(
      activity?.activityType || activity?.name || ""
    ).toLowerCase();
    if (raw.includes("make")) return "make";
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

  const resolveVariantLabels = (assemblyId: number | null) => {
    if (!assemblyId) return ["Qty"];
    const labels =
      quantityItemsById.get(assemblyId)?.variants?.labels ||
      firstAssembly?.variantSet?.variants ||
      [];
    return labels && labels.length ? labels : ["Qty"];
  };

  const openDefectModal = (opts?: { assemblyId?: number | null; activity?: any }) => {
    const targetAssemblyId =
      opts?.assemblyId ?? defectAssemblyId ?? firstAssembly?.id ?? null;
    const labels = resolveVariantLabels(targetAssemblyId);
    const activity = opts?.activity;
    setDefectAssemblyId(targetAssemblyId);
    setDefectStage(String(activity?.stage || "cut"));
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
    setModalAssemblyId(assemblyId ?? firstAssembly?.id ?? null);
    setCreateActivityType("cut");
    setEditActivity(null);
    setActivityModalOpen(true);
  };

  const handleRecordMake = (assemblyId: number) => {
    if (!canRecordMakeForAssembly(assemblyId)) return;
    setModalAssemblyId(assemblyId ?? firstAssembly?.id ?? null);
    setCreateActivityType("make");
    setEditActivity(null);
    setActivityModalOpen(true);
  };

  const handleRecordPack = (assemblyId: number) => {
    if (!canRecordPackForAssembly(assemblyId)) return;
    setPackModalAssemblyId(assemblyId);
    setPackModalOpen(true);
  };

  const statusControlElements = isGroup
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
            <>
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
                  <TextInput
                    readOnly
                    value={((a as any).product?.name as string) || ""}
                    label="Product"
                    mod="data-autosize"
                  />
                  <TextInput
                    readOnly
                    value={a.id || ""}
                    label="ID"
                    mod="data-autosize"
                  />
                </Card>
              </Grid.Col>
              <Grid.Col span={7} key={a.id}>
                <Group justify="flex-end" mb="xs">
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => setFactoryAssemblyId(a.id)}
                  >
                    Show factory view
                  </Button>
                </Group>
                <AssemblyQuantitiesCard
                  // title={`Quantities — Assembly ${a.id}`}
                  variants={item.variants}
                  items={[
                    {
                      label: `Assembly ${a.id}`,
                      ordered: item.ordered,
                      cut: item.cut,
                      make: item.make,
                      pack: item.pack,
                      totals: item.totals,
                    },
                  ]}
                  editableOrdered
                  hideInlineActions
                  orderedValue={editForm.watch(
                    `orderedByAssembly.${a.id}` as any
                  )}
                  onChangeOrdered={(arr) =>
                    editForm.setValue(`orderedByAssembly.${a.id}` as any, arr, {
                      shouldDirty: true,
                      shouldTouch: true,
                    })
                  }
                  actionColumn={{
                    onRecordCut: () => handleRecordCut(a.id),
                    onRecordMake: () => handleRecordMake(a.id),
                    recordMakeDisabled: !canRecordMakeForAssembly(a.id),
                    onRecordPack: () => handleRecordPack(a.id),
                    recordPackDisabled: !canRecordPackForAssembly(a.id),
                  }}
                />
              </Grid.Col>
            </>
          );
        })}
        <Grid.Col span={12} mt="lg">
          <AssemblyCostingsTable
            title="Costings"
            actions={[
              <AddCostingButton
                products={products || []}
                jobId={job?.id || 0}
                assemblyId={firstAssembly?.id || 0}
              />,
              <Link
                to={`/jobs/${job?.id || 0}/assembly/${(assemblies || [])
                  .map((a) => a.id)
                  .join(",")}/costings-sheet`}
                prefetch="intent"
                key="open-sheet"
                style={{ textDecoration: "none" }}
              >
                <Button variant="default" size="xs">
                  Open Sheet
                </Button>
              </Link>,
            ]}
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
                    costingDisabledMap?.[String(row.id)] ?? row.flagIsDisabled,
                })) || []) as any
            }
            accordionByProduct
          />
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
                            {representative?.activityType
                              ? String(
                                  representative.activityType
                                ).toUpperCase()
                              : representative?.name || "Activity"}
                          </Table.Td>
                          <Table.Td>{assemblyLabel}</Table.Td>
                          {activityVariantHeaders.map(
                            (_label: string, idx: number) => (
                              <Table.Td ta="center" key={`${key}-qty-${idx}`}>
                                {breakdown[idx] ? breakdown[idx] : ""}
                              </Table.Td>
                            )
                          )}
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
                                    if (representative?.kind === "defect") {
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
              make: item?.make || [],
              pack: item?.pack || [],
            };
            const usableTotalMap: Record<string, number | undefined> = {
              cut: item?.totals?.cut,
              make: item?.totals?.make,
              pack: item?.totals?.pack,
            };
            const factoryRows = (["cut", "make", "pack"] as const).flatMap(
              (stage) => {
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
                      {factoryRows.map((row) => (
                        <Table.Tr
                          key={row.label}
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
              ? modalActivityType === "make"
                ? "group.activity.create.make"
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
                { value: "make", label: "Make" },
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
                Total: {totalQty}
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
                  {variantLabels.map((_label: string, idx: number) => (
                    <Table.Td p={0} ta="center" key={`defect-cell-${idx}`}>
                      <TextInput
                        type="number"
                        variant="unstyled"
                        inputMode="numeric"
                        value={
                          Number.isFinite(defectBreakdown[idx])
                            ? String(defectBreakdown[idx])
                            : ""
                        }
                        onChange={(e) => {
                          const val = Number(e.currentTarget.value);
                          setDefectBreakdown((prev) => {
                            const next = [...prev];
                            next[idx] = Number.isFinite(val) ? val : 0;
                            return next;
                          });
                        }}
                        styles={{
                          input: {
                            textAlign: "center",
                            padding: "8px 4px",
                          },
                        }}
                      />
                    </Table.Td>
                  ))}
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
