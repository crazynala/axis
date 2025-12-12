import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import { DatePickerInput } from "@mantine/dates";
import { useSubmit } from "@remix-run/react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { ExternalLink } from "./ExternalLink";
import { IconInfoCircle } from "@tabler/icons-react";
import {
  buildAssemblyActivityDefaultValues,
  calculateConsumptionTotals,
  calculateUnitsInCut,
  serializeAssemblyActivityValues,
} from "~/modules/job/forms/jobAssemblyActivityMarshaller";
import type { AssemblyActivityFormValues } from "~/modules/job/forms/jobAssemblyActivityMarshaller";

type Costing = {
  id: number;
  usageType: string | null;
  quantityPerUnit: number | null;
  component?: { id: number; sku: string | null; name: string | null } | null;
  product?: { id: number; sku: string | null; name: string | null } | null;
};

type BatchRow = {
  id: number;
  name: string | null;
  codeMill: string | null;
  codeSartor: string | null;
  quantity: number | null;
  location?: { id: number; name: string | null } | null;
};

type PackReference =
  | {
      kind: "shipment";
      shipmentLineId: number;
      shipmentId: number | null;
      trackingNo?: string | null;
      packingSlipCode?: string | null;
      shipmentType?: string | null;
    };

const formatBatchCodes = (batch?: BatchRow | null) => {
  if (!batch) return "";
  const parts = [batch.codeMill, batch.codeSartor]
    .map((v) => (v ?? "").toString().trim())
    .filter((v) => v.length);
  if (parts.length) return parts.join(" | ");
  return batch.name || String(batch.id ?? "");
};

export function AssemblyActivityModal(props: {
  opened: boolean;
  onClose: () => void;
  assembly: any;
  productVariantSet?: { variants: string[] } | null;
  costings: Costing[];
  activityType: "cut" | "make" | "pack";
  mode?: "create" | "edit";
  activityId?: number;
  initialDate?: Date | string | null;
  initialBreakdown?: number[] | null;
  initialConsumption?: Record<number, Record<number, number>>;
  extraFields?: Record<string, string | number>;
  overrideIntent?: string;
  packReference?: PackReference | null;
  // Optional: when launching from a group, provide per-assembly quantity items
  groupQtyItems?: Array<{
    assemblyId: number;
    variants: { labels: string[]; numVariants?: number };
    ordered?: number[];
    cut?: number[];
  }>;
}) {
  const {
    opened,
    onClose,
    assembly,
    productVariantSet,
    costings,
    activityType,
    mode = "create",
    activityId,
    initialDate,
    initialBreakdown,
    initialConsumption,
    extraFields,
    overrideIntent,
    packReference,
  } = props;
  const submit = useSubmit();
  const labelsRaw =
    (assembly.variantSet?.variants?.length
      ? assembly.variantSet.variants
      : productVariantSet?.variants) || [];
  const labels = useMemo(() => {
    let last = -1;
    for (let i = labelsRaw.length - 1; i >= 0; i--) {
      const s = (labelsRaw[i] || "").toString().trim();
      if (s) {
        last = i;
        break;
      }
    }
    const cnum = (assembly as any).c_numVariants as number | undefined;
    const effectiveLen = Math.max(
      0,
      Math.min(
        typeof cnum === "number" && cnum > 0 ? cnum : labelsRaw.length,
        last + 1
      )
    );
    return labelsRaw.slice(0, effectiveLen);
  }, [labelsRaw, assembly]);
  // Single-assembly defaults
  const ordered = ((assembly as any).qtyOrderedBreakdown || []) as number[];
  const alreadyCut =
    (((assembly as any).c_qtyCut_Breakdown || []) as number[]) || [];
  const leftToCutExt =
    (((assembly as any).c_qtyLeftToCut_Breakdown || []) as number[]) || [];
  const defaultBreakdown = useMemo(() => {
    const len = labels.length; // strictly respect effective variant columns
    if (activityType === "make") {
      return Array.from({ length: len }, (_, i) =>
        Math.max(0, Number(alreadyCut[i] || 0) || 0)
      );
    }
    return Array.from({ length: len }, (_, i) => {
      const ext = leftToCutExt[i];
      if (Number.isFinite(ext)) return Math.max(0, Number(ext));
      return Math.max(0, (ordered[i] || 0) - (alreadyCut[i] || 0));
    });
  }, [activityType, labels, ordered, alreadyCut, leftToCutExt]);

  // Group-assembly defaults prepared from provided groupQtyItems
  const groupDefaults = useMemo(() => {
    if (!props.groupQtyItems || props.groupQtyItems.length === 0) return null;
    return props.groupQtyItems.map((g) => {
      const rawLabels = g.variants?.labels || [];
      // trim labels to last non-empty
      let last = -1;
      for (let i = rawLabels.length - 1; i >= 0; i--) {
        const s = (rawLabels[i] || "").toString().trim();
        if (s) {
          last = i;
          break;
        }
      }
      const baseLen = Math.max(
        rawLabels.length,
        Math.max(g.ordered?.length || 0, g.cut?.length || 0)
      );
      const effectiveLen = Math.max(
        0,
        last >= 0 ? Math.min(baseLen, last + 1) : baseLen
      );
      const labels = rawLabels.slice(0, effectiveLen);
      const def = Array.from({ length: effectiveLen }, (_, i) => {
        if (activityType === "make") {
          return Math.max(0, Number(g.cut?.[i] || 0) || 0);
        }
        const ord = Number(g.ordered?.[i] || 0) || 0;
        const cut = Number(g.cut?.[i] || 0) || 0;
        const left = Math.max(0, ord - cut);
        return left;
      });
      return {
        assemblyId: g.assemblyId,
        labels,
        defaultBreakdown: def,
      };
    });
  }, [activityType, props.groupQtyItems]);
  const groupDefaultsResetKey = useMemo(() => {
    if (!groupDefaults || groupDefaults.length === 0) return "none";
    return groupDefaults
      .map((g) => `${g.assemblyId}:${g.defaultBreakdown.join(",")}`)
      .join("|");
  }, [groupDefaults]);
  const defaultBreakdownResetKey = useMemo(
    () => defaultBreakdown.join(","),
    [defaultBreakdown]
  );
  const initialBreakdownResetKey = useMemo(
    () => (initialBreakdown ? initialBreakdown.join(",") : "none"),
    [initialBreakdown]
  );
  const initialConsumptionResetKey = useMemo(() => {
    if (!initialConsumption) return "none";
    return Object.entries(initialConsumption)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([cid, inner]) => {
        if (!inner) return `${cid}:none`;
        return `${cid}:${Object.entries(inner)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([bid, value]) => `${bid}:${value}`)
          .join(",")}`;
      })
      .join("|");
  }, [initialConsumption]);

  const defaultValues = useMemo(
    () =>
      buildAssemblyActivityDefaultValues({
        mode,
        initialDate,
        initialBreakdown,
        defaultBreakdown,
        groupDefaults: groupDefaults?.map(
          ({ assemblyId, defaultBreakdown }) => ({
            assemblyId,
            defaultBreakdown,
          })
        ),
        initialConsumption,
      }),
    [
      mode,
      initialDate,
      initialBreakdown,
      defaultBreakdown,
      groupDefaults,
      initialConsumption,
    ]
  );
  const defaultsResetKey = useMemo(() => {
    const dateKey = initialDate
      ? new Date(initialDate as any).toISOString()
      : "none";
    return [
      mode,
      activityType,
      activityId ?? "new",
      dateKey,
      defaultBreakdownResetKey,
      groupDefaultsResetKey,
      initialBreakdownResetKey,
      initialConsumptionResetKey,
    ].join("|");
  }, [
    mode,
    activityType,
    activityId,
    initialDate,
    defaultBreakdownResetKey,
    groupDefaultsResetKey,
    initialBreakdownResetKey,
    initialConsumptionResetKey,
  ]);

  const form = useForm<AssemblyActivityFormValues>({
    defaultValues,
  });
  const { control, handleSubmit, reset, setValue, register, getValues } = form;
  const qtyGroupArray = useFieldArray({ control, name: "qtyGroup" as const });
  const [openedCostings, setOpenedCostings] = useState<string[]>([]);
  const [batchesByCosting, setBatchesByCosting] = useState<
    Record<number, BatchRow[]>
  >({});
  const [loadingCosting, setLoadingCosting] = useState<Record<number, boolean>>(
    {}
  );
  const [batchScope, setBatchScope] = useState<"all" | "current">("current");
  const [batchLocScope, setBatchLocScope] = useState<"all" | "job">(
    (props.assembly?.job?.locationInId ?? null) != null ? "job" : "all"
  );
  const [isEditing, setIsEditing] = useState(mode !== "edit");
  const qtyBreakdownValues = useWatch({ control, name: "qtyBreakdown" }) ?? [];
  const qtyGroupValues =
    (useWatch({ control, name: "qtyGroup" }) as
      | AssemblyActivityFormValues["qtyGroup"]
      | undefined) ?? [];
  const consumption =
    useWatch({ control, name: "consumption" }) ||
    ({} as Record<string, Record<string, string>>);
  const consumptionTotals = useMemo(
    () => calculateConsumptionTotals(consumption),
    [consumption]
  );
  const previouslyConsumedByCosting = useMemo(() => {
    if (!initialConsumption)
      return {} as Record<number, Record<number, number>>;
    const map: Record<number, Record<number, number>> = {};
    for (const [cidRaw, batches] of Object.entries(initialConsumption)) {
      const cid = Number(cidRaw);
      if (!Number.isFinite(cid)) continue;
      map[cid] = {};
      for (const [bidRaw, qty] of Object.entries(batches || {})) {
        const bid = Number(bidRaw);
        if (!Number.isFinite(bid)) continue;
        map[cid][bid] = Number(qty) || 0;
      }
    }
    return map;
  }, [initialConsumption]);
  const unitsInCut = useMemo(
    () => calculateUnitsInCut(qtyBreakdownValues, qtyGroupValues || undefined),
    [qtyBreakdownValues, qtyGroupValues]
  );
  const isPack = activityType === "pack";
  const isLegacyPack = isPack && packReference?.kind === "shipment";
  const readOnly = mode === "edit" && (!isEditing || isLegacyPack);
  const showConsumptionSection = !isPack;
  const setConsumptionValue = useCallback(
    (cid: number, bid: number, value: string) => {
      const path = `consumption.${cid}.${bid}` as const;
      setValue(path as any, value, { shouldDirty: true, shouldTouch: true });
    },
    [setValue]
  );
  const clampConsumptionEntry = useCallback(
    (cid: number, bid: number, maxQty: number) => {
      const path = `consumption.${cid}.${bid}` as const;
      const raw = getValues(path as any);
      if (raw == null || raw === "") return;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        setValue(path as any, "", { shouldDirty: true });
        return;
      }
      const clamped = Math.max(0, Math.min(num, maxQty));
      const nextVal = String(clamped);
      if (nextVal === raw) return;
      setValue(path as any, nextVal, { shouldDirty: true });
    },
    [getValues, setValue]
  );

  useEffect(() => {
    if (!opened) return;
    setIsEditing(mode !== "edit");
    reset(
      buildAssemblyActivityDefaultValues({
        mode,
        initialDate,
        initialBreakdown,
        defaultBreakdown,
        groupDefaults: groupDefaults?.map(
          ({ assemblyId, defaultBreakdown }) => ({
            assemblyId,
            defaultBreakdown,
          })
        ),
        initialConsumption,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, defaultsResetKey, reset]);

  const eligibleCostings = useMemo(() => {
    const eligibleCostings = (costings || []).filter(
      (c) =>
        (c.usageType || (c as any)) &&
        String(c.usageType || (c as any).activityUsed || "").toLowerCase() ===
          activityType &&
        !!(c.quantityPerUnit && c.quantityPerUnit !== 0)
    );
    // console.log(
    //   "Eligible costings for activity type",
    //   activityType,
    //   eligibleCostings,
    //   "all costings",
    //   costings
    // );
    return eligibleCostings;
  }, [costings, activityType]);

  // Ensure batch metadata is ready for costings with existing consumption so read-only views can render labels
  useEffect(() => {
    if (!opened || !initialConsumption) return;
    const cidList = Object.keys(initialConsumption)
      .map((cid) => Number(cid))
      .filter((cid) => Number.isFinite(cid));
    for (const cid of cidList) {
      if (batchesByCosting[cid]) continue;
      const cost = eligibleCostings.find((c) => c.id === cid);
      if (!cost) continue;
      const productId = cost.product?.id ?? cost.component?.id ?? null;
      if (productId) void loadBatchesForCosting(cid, productId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialConsumption, eligibleCostings]);

  // Open first panel by default when modal opens and costings are ready
  useEffect(() => {
    if (!opened) return;
    // Use functional update to avoid stale closure and unnecessary loops
    if (eligibleCostings.length > 0) {
      setOpenedCostings((prev) => {
        if (prev && prev.length > 0) return prev;
        return [String(eligibleCostings[0].id)];
      });
    }
    // Only depend on primitives to reduce churn
  }, [opened, eligibleCostings.length]);

  async function loadBatchesForCosting(
    costingId: number,
    productId: number | null | undefined
  ) {
    if (!productId) return;
    if (loadingCosting[costingId]) return;
    setLoadingCosting((s) => ({ ...s, [costingId]: true }));
    try {
      const resp = await fetch(`/api/batches/${productId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      setBatchesByCosting((prev) => ({
        ...prev,
        [costingId]: data.batches || [],
      }));
    } catch {
    } finally {
      setLoadingCosting((s) => ({ ...s, [costingId]: false }));
    }
  }

  // Lazy-load batches when a costing panel is opened
  useEffect(() => {
    for (const key of openedCostings) {
      const cid = Number(key);
      if (!Number.isFinite(cid)) continue;
      if (!batchesByCosting[cid]) {
        const cost = eligibleCostings.find((x) => x.id === cid);
        if (cost) {
          const productId = cost.product?.id ?? cost.component?.id ?? null;
          void loadBatchesForCosting(cid, productId);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedCostings]);

  const onSubmit = handleSubmit((values) => {
    if (mode === "edit" && readOnly) return;
    const fd = serializeAssemblyActivityValues(values, {
      mode,
      activityType,
      activityId,
      extraFields,
      overrideIntent,
    });
    submit(fd, { method: "post" });
    onClose();
  });

  const resetFormToDefaults = useCallback(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      withCloseButton={mode === "edit"}
      title={
        mode === "edit"
          ? "Edit Activity"
          : activityType === "cut"
          ? "Record Cut"
          : activityType === "make"
          ? "Record Make"
          : "Record Activity"
      }
      size="xxl"
      centered
    >
      <form onSubmit={onSubmit}>
        <Stack p="lg" gap="lg">
          <Group align="flex-end" justify="space-between">
            <Controller
              control={control}
              name="activityDate"
              render={({ field }) => (
                <DatePickerInput
                  label="Date"
                  value={field.value}
                  onChange={(value) => field.onChange(value ?? null)}
                  valueFormat="YYYY-MM-DD"
                  disabled={readOnly}
                  required
                />
              )}
            />
            <Group gap="xs">
              {mode === "edit" ? (
                isEditing && !readOnly ? (
                  <>
                    <Button
                      variant="default"
                      onClick={() => {
                        resetFormToDefaults();
                        setIsEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="filled" disabled={readOnly}>
                      Save
                    </Button>
                  </>
                ) : isLegacyPack ? null : (
                  <Button variant="filled" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                )
              ) : (
                <Button type="submit" variant="filled">
                  Save
                </Button>
              )}
            </Group>
          </Group>

          {isPack && mode === "edit" ? (
            <Stack gap="xs">
              <Group gap={6} align="flex-start">
                <IconInfoCircle size={16} color="var(--mantine-color-dimmed)" />
                <Text size="sm" c="dimmed">
                  Pack activities are shown in read-only by default.
                  {isLegacyPack
                    ? " This record was created before boxes and was linked to a shipment, so it cannot be edited."
                    : " Click Edit to adjust the recorded pack."}
                </Text>
              </Group>
              {packReference?.kind === "shipment" ? (
                <Text size="sm">
                  Shipment:{" "}
                  {packReference.shipmentId ? (
                    <ExternalLink href={`/shipments/${packReference.shipmentId}`}>
                      #{packReference.shipmentId}
                    </ExternalLink>
                  ) : (
                    "Unknown"
                  )}
                  {packReference.trackingNo
                    ? ` • Tracking ${packReference.trackingNo}`
                    : ""}
                  {packReference.packingSlipCode
                    ? ` • Slip ${packReference.packingSlipCode}`
                    : ""}
                </Text>
              ) : null}
            </Stack>
          ) : null}

          <Stack gap="md">
            {groupDefaults && groupDefaults.length > 0 ? (
              <Stack gap="md">
                {(qtyGroupArray.fields || []).map((field, groupIndex) => {
                  const gDef =
                    groupDefaults.find(
                      (g) => g.assemblyId === field.assemblyId
                    ) || groupDefaults[groupIndex];
                  const glabels = gDef?.labels || labels;
                  return (
                    <Stack key={field.id || groupIndex} gap="xs">
                      <Group justify="space-between" align="center">
                        <Title order={6}>
                          Assembly A{gDef?.assemblyId ?? field.assemblyId}
                        </Title>
                      </Group>
                      <Table
                        withColumnBorders
                        withTableBorder
                        striped
                        style={{ tableLayout: "fixed" }}
                      >
                        <Table.Thead>
                          <Table.Tr>
                            {glabels.map(
                              (label: string, labelIndex: number) => (
                                <Table.Th
                                  key={`group-head-${groupIndex}-${labelIndex}`}
                                  ta="center"
                                  py={2}
                                  fz="xs"
                                  style={{ width: 56 }}
                                >
                                  {label || `${labelIndex + 1}`}
                                </Table.Th>
                              )
                            )}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          <Table.Tr>
                            {glabels.map(
                              (_label: string, labelIndex: number) => {
                                const registration = register(
                                  `qtyGroup.${groupIndex}.qtyBreakdown.${labelIndex}.value` as const
                                );
                                return (
                                  <Table.Td
                                    key={`group-cell-${groupIndex}-${labelIndex}`}
                                    p={0}
                                    ta="center"
                                    style={{ position: "relative", width: 56 }}
                                  >
                                    <TextInput
                                      type="number"
                                      variant="unstyled"
                                      inputMode="numeric"
                                      {...registration}
                                      readOnly={readOnly}
                                      disabled={readOnly}
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
                                );
                              }
                            )}
                          </Table.Tr>
                        </Table.Tbody>
                      </Table>
                    </Stack>
                  );
                })}
              </Stack>
            ) : (
              <Table
                withColumnBorders
                withTableBorder
                striped
                style={{ tableLayout: "fixed" }}
              >
                <Table.Thead>
                  <Table.Tr>
                    {labels.map((label: string, index: number) => (
                      <Table.Th
                        key={`single-head-${index}`}
                        ta="center"
                        style={{ width: 56 }}
                      >
                        {label || `${index + 1}`}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    {labels.map((_label: string, index: number) => {
                      const registration = register(
                        `qtyBreakdown.${index}.value` as const
                      );
                      return (
                        <Table.Td
                          key={`single-cell-${index}`}
                          p={0}
                          ta="center"
                          style={{ position: "relative", width: 56 }}
                        >
                          <TextInput
                            type="number"
                            variant="unstyled"
                            inputMode="numeric"
                            {...registration}
                            readOnly={readOnly}
                            disabled={readOnly}
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
                      );
                    })}
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            )}
          </Stack>

          {showConsumptionSection ? (
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Title order={6}>Material Consumption</Title>
                <Text size="sm" c="dimmed">
                  Units recorded: {unitsInCut}
                </Text>
              </Group>

              {mode === "edit" && readOnly ? (
                <Stack gap="sm">
                  {Object.keys(previouslyConsumedByCosting).length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No material consumption recorded for this activity.
                    </Text>
                  ) : (
                    Object.entries(previouslyConsumedByCosting).map(
                      ([cidRaw, batches]) => {
                        const cid = Number(cidRaw);
                        const costing = costings.find((c) => c.id === cid);
                        const comp = costing?.product ?? costing?.component;
                        const compLabel = comp
                          ? `[${comp.sku || ""}] ${comp.name || ""}`
                          : "Unknown component";
                        const costingBatches = batchesByCosting[cid] || [];
                        return (
                          <Stack key={cid} gap="xs">
                            <Group gap={8} align="center" wrap="wrap">
                              <Text fw={600}>{compLabel}</Text>
                              <Text size="sm" c="dimmed">
                                Total consumed:{" "}
                                {consumptionTotals[cid] ?? 0} /{" "}
                                {(costing?.quantityPerUnit || 0) * unitsInCut}
                              </Text>
                            </Group>
                            <Table withTableBorder withColumnBorders striped>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th>ID</Table.Th>
                                  <Table.Th>Batch</Table.Th>
                                  <Table.Th>Location</Table.Th>
                                  <Table.Th>Qty</Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {Object.entries(batches).map(
                                  ([bidRaw, qty]) => {
                                    const bid = Number(bidRaw);
                                    const match =
                                      costingBatches.find(
                                        (b) => Number(b.id) === bid
                                      ) || null;
                                    return (
                                      <Table.Tr key={`${cid}-${bid}`}>
                                        <Table.Td>
                                          {bid && bid !== 0 ? (
                                            <ExternalLink
                                              href={`/batches/${bid}`}
                                            >
                                              {bid}
                                            </ExternalLink>
                                          ) : (
                                            <Text size="sm" c="dimmed">
                                              Untracked
                                            </Text>
                                          )}
                                        </Table.Td>
                                        <Table.Td>
                                          {formatBatchCodes(match) ||
                                            "(unnamed)"}
                                        </Table.Td>
                                        <Table.Td>
                                          {match?.location?.name || ""}
                                        </Table.Td>
                                        <Table.Td>{qty}</Table.Td>
                                      </Table.Tr>
                                    );
                                  }
                                )}
                              </Table.Tbody>
                            </Table>
                          </Stack>
                        );
                      }
                    )
                  )}
                </Stack>
              ) : (
                <>
                  <Group gap={12} align="center" wrap="wrap">
                    <SegmentedControl
                      data={[
                        { label: "All", value: "all" },
                        { label: "Current", value: "current" },
                      ]}
                      size="xs"
                      value={batchScope}
                      onChange={(value) =>
                        setBatchScope(value as "all" | "current")
                      }
                      disabled={readOnly}
                    />
                    <SegmentedControl
                      data={(() => {
                        const locName = (
                          assembly?.job?.locationIn?.name || ""
                        ).trim();
                        const jobLabel = locName || "Job location";
                        return [
                          { label: "All", value: "all" },
                          { label: jobLabel, value: "job" },
                        ];
                      })()}
                      size="xs"
                      value={batchLocScope}
                      onChange={(value) =>
                        setBatchLocScope(value as "all" | "job")
                      }
                      disabled={readOnly}
                    />
                  </Group>

                  {eligibleCostings.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No material costings are configured for this activity type.
                    </Text>
                  ) : (
                    <Accordion
                      multiple
                      variant="contained"
                      value={openedCostings}
                      onChange={(values) => setOpenedCostings(values as string[])}
                    >
                      {eligibleCostings.map((costing) => {
                        const cid = costing.id;
                        const comp = costing.product ?? costing.component ?? null;
                        const compId = comp?.id ?? null;
                        const compSku = comp?.sku ?? "";
                        const compName = comp?.name ?? "";
                        const consumed = consumptionTotals[cid] ?? 0;
                        const expected =
                          (costing.quantityPerUnit || 0) * unitsInCut;
                        const costingBatches = batchesByCosting[cid] || [];
                        const jobLocId = (assembly?.job?.stockLocationId ??
                          null) as number | null;
                        const batchInfos = costingBatches
                          .map((batch) => {
                            const batchId = Number(batch.id);
                            const consumedPreviously =
                              previouslyConsumedByCosting[cid]?.[batchId] ?? 0;
                            const effectiveAvailable = Math.max(
                              0,
                              (Number(batch.quantity ?? 0) || 0) +
                                consumedPreviously
                            );
                            const consumeValue =
                              consumption[cid]?.[batchId] ??
                              (consumedPreviously
                                ? String(consumedPreviously)
                                : "");
                            const passesScope =
                              batchScope === "current"
                                ? effectiveAvailable > 0 ||
                                  consumeValue !== ""
                                : true;
                            const passesLocation =
                              batchLocScope === "all" ||
                              consumeValue !== "" ||
                              !jobLocId
                                ? true
                                : (batch.location?.id ?? null) === jobLocId;
                            return {
                              batch,
                              batchId,
                              effectiveAvailable,
                              consumeValue,
                              passesScope,
                              passesLocation,
                            };
                          })
                          .filter((info) => info.passesScope && info.passesLocation);
                        const batchIdsInList = new Set(
                          batchInfos.map((info) => info.batchId)
                        );
                        // Ensure we show any existing consumption that lacks a batch record (e.g., legacy/untracked)
                        Object.keys(consumption[cid] || {}).forEach((bidKey) => {
                          const bid = Number(bidKey);
                          if (!Number.isFinite(bid)) return;
                          if (batchIdsInList.has(bid)) return;
                          const consumeValue = consumption[cid]?.[bidKey] ?? "";
                          batchInfos.push({
                            batch: {
                              id: bid,
                              name: bid === 0 ? "Untracked batch" : `Batch ${bid}`,
                              codeMill: null,
                              codeSartor: null,
                              quantity: null,
                              location: null,
                            },
                            batchId: bid,
                            effectiveAvailable: 0,
                            consumeValue,
                            passesScope: true,
                            passesLocation: true,
                          });
                        });

                        return (
                          <Accordion.Item key={cid} value={String(cid)}>
                            <Accordion.Control>
                              <Group
                                justify="space-between"
                                wrap="nowrap"
                                align="center"
                              >
                                <Group gap={8} wrap="nowrap" align="center">
                                  {compId ? (
                                    <ExternalLink href={`/products/${compId}`}>
                                      {compId}
                                    </ExternalLink>
                                  ) : (
                                    <Text c="dimmed">?</Text>
                                  )}
                                  <Text style={{ whiteSpace: "nowrap" }}>
                                    [{compSku || ""}]
                                  </Text>
                                  <Text inherit>{compName || ""}</Text>
                                </Group>
                                <Group
                                  gap={4}
                                  wrap="nowrap"
                                  align="center"
                                  ml="auto"
                                >
                                  <Text inherit>{consumed}</Text>
                                  <Text c="dimmed">/</Text>
                                  <Text inherit>{expected}</Text>
                                </Group>
                              </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                              <Group gap={8} mb={4} align="center">
                                <Text size="sm" fw={600}>
                                  Batches
                                </Text>
                                {loadingCosting[cid] && (
                                  <Text size="xs" c="dimmed">
                                    Loading...
                                  </Text>
                                )}
                              </Group>
                              <Table withTableBorder withColumnBorders striped>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th>ID</Table.Th>
                                    <Table.Th>Batch</Table.Th>
                                    <Table.Th>Location</Table.Th>
                                    <Table.Th>Available</Table.Th>
                                    <Table.Th>Consume</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {batchInfos.length === 0 ? (
                                    <Table.Tr>
                                      <Table.Td colSpan={5}>
                                        <Text size="sm" c="dimmed">
                                          {loadingCosting[cid]
                                            ? "Fetching batches..."
                                            : "No batches match the current filters."}
                                        </Text>
                                      </Table.Td>
                                    </Table.Tr>
                                  ) : (
                                    batchInfos.map((info) => (
                                      <Table.Tr key={info.batch.id}>
                                    <Table.Td>
                                      {info.batch.id && info.batch.id !== 0 ? (
                                        <ExternalLink
                                          href={`/batches/${info.batch.id}`}
                                        >
                                          {info.batch.id}
                                        </ExternalLink>
                                      ) : (
                                        <Text size="sm" c="dimmed">
                                          Untracked
                                        </Text>
                                      )}
                                    </Table.Td>
                                        <Table.Td>
                                          {formatBatchCodes(info.batch) ||
                                            "(unnamed)"}
                                        </Table.Td>
                                        <Table.Td>
                                          {info.batch.location?.name || ""}
                                        </Table.Td>
                                        <Table.Td>
                                          <Text
                                            style={{ cursor: "pointer" }}
                                            onClick={() => {
                                              const qString = String(
                                                info.effectiveAvailable || 0
                                              );
                                              setConsumptionValue(
                                                cid,
                                                info.batchId,
                                                qString
                                              );
                                            }}
                                          >
                                            {info.effectiveAvailable}
                                          </Text>
                                        </Table.Td>
                                        <Table.Td>
                                          <TextInput
                                            w={100}
                                            type="number"
                                            inputMode="decimal"
                                            value={info.consumeValue}
                                            onChange={(event) =>
                                              setConsumptionValue(
                                                cid,
                                                info.batchId,
                                                event.currentTarget.value
                                              )
                                            }
                                            onBlur={() =>
                                              clampConsumptionEntry(
                                                cid,
                                                info.batchId,
                                                info.effectiveAvailable
                                              )
                                            }
                                            disabled={readOnly}
                                          />
                                        </Table.Td>
                                      </Table.Tr>
                                    ))
                                  )}
                                </Table.Tbody>
                              </Table>
                            </Accordion.Panel>
                          </Accordion.Item>
                        );
                      })}
                    </Accordion>
                  )}
                </>
              )}
            </Stack>
          ) : null}
        </Stack>
      </form>
    </Modal>
  );
}
