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
} from "@mantine/core";
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
    activities,
    activityConsumptionMap,
    activityVariantLabels,
    groupContext,
    renderStatusBar,
    packContext,
  } = props;
  const submit = useSubmit();
  const isGroup = (assemblies?.length ?? 0) > 1;
  const firstAssembly = assemblies[0];
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
  const deleteRequiredPhrase = "I AM SO SURE";
  const editForm = useForm<{
    orderedByAssembly: Record<string, number[]>;
    qpu: Record<string, number>;
    activity: Record<string, string>;
    names: Record<string, string>;
    statusNotes: Record<string, string>;
    statuses: Record<string, string>;
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
  const modalAssembly =
    (modalAssemblyId != null && assembliesById.get(modalAssemblyId)) ||
    firstAssembly;
  const packModalAssembly =
    (packModalAssemblyId != null && assembliesById.get(packModalAssemblyId)) ||
    null;
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
  const activityRows = activities || [];
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
            common={
              ((assemblies || []).flatMap((a) =>
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
              ) || []) as any
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
                                    setModalAssemblyId(targetAssemblyId);
                                    setEditActivity(representative);
                                    setActivityModalOpen(true);
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
              ? activityConsumptionMap?.[editActivity.id] || {}
              : undefined
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
