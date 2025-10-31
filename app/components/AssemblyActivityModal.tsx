import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useSubmit } from "@remix-run/react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { ExternalLink } from "./ExternalLink";
import { SegmentedControl } from "@mantine/core";

type Costing = {
  id: number;
  usageType: string | null;
  quantityPerUnit: number | null;
  component?: { id: number; sku: string | null; name: string | null } | null;
};

type BatchRow = {
  id: number;
  name: string | null;
  codeMill: string | null;
  codeSartor: string | null;
  quantity: number | null;
  location?: { id: number; name: string | null } | null;
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
    return Array.from({ length: len }, (_, i) => {
      const ext = leftToCutExt[i];
      if (Number.isFinite(ext)) return Math.max(0, Number(ext));
      return Math.max(0, (ordered[i] || 0) - (alreadyCut[i] || 0));
    });
  }, [labels, ordered, alreadyCut, leftToCutExt]);

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
  }, [props.groupQtyItems]);

  const form = useForm<{
    activityDate: Date | null;
    qtyBreakdown: { value: number }[]; // single-assembly path
    qtyGroup?: Array<{ assemblyId: number; qtyBreakdown: { value: number }[] }>; // group path
  }>({
    defaultValues: (() => {
      if (groupDefaults && groupDefaults.length > 0) {
        return {
          activityDate: initialDate ? new Date(initialDate as any) : new Date(),
          qtyBreakdown: [],
          qtyGroup: groupDefaults.map((g) => ({
            assemblyId: g.assemblyId,
            qtyBreakdown: g.defaultBreakdown.map((n) => ({ value: n || 0 })),
          })),
        };
      }
      return {
        activityDate: initialDate ? new Date(initialDate as any) : new Date(),
        qtyBreakdown: (initialBreakdown && Array.isArray(initialBreakdown)
          ? initialBreakdown
          : defaultBreakdown
        ).map((n) => ({ value: n || 0 })),
      };
    })(),
  });
  const { control, handleSubmit, reset, watch, setValue } = form;
  const qtyArray = useFieldArray({ control, name: "qtyBreakdown" });
  const qtyGroupArray = useFieldArray({ control, name: "qtyGroup" as const });
  const [openedCostings, setOpenedCostings] = useState<string[]>([]);
  const [batchesByCosting, setBatchesByCosting] = useState<
    Record<number, BatchRow[]>
  >({});
  const [loadingCosting, setLoadingCosting] = useState<Record<number, boolean>>(
    {}
  );
  const [consumption, setConsumption] = useState<
    Record<number, Record<number, number>>
  >({}); // costingId -> batchId -> qty
  const [batchScope, setBatchScope] = useState<"all" | "current">("current");
  const [batchLocScope, setBatchLocScope] = useState<"all" | "job">(
    (props.assembly?.job?.locationInId ?? null) != null ? "job" : "all"
  );

  useEffect(() => {
    if (!opened) return;
    if (groupDefaults && groupDefaults.length > 0) {
      reset({
        activityDate: initialDate ? new Date(initialDate as any) : new Date(),
        qtyBreakdown: [],
        qtyGroup: groupDefaults.map((g) => ({
          assemblyId: g.assemblyId,
          qtyBreakdown: g.defaultBreakdown.map((n) => ({ value: n || 0 })),
        })),
      });
    } else {
      reset({
        activityDate: initialDate ? new Date(initialDate as any) : new Date(),
        qtyBreakdown: (initialBreakdown && Array.isArray(initialBreakdown)
          ? initialBreakdown
          : defaultBreakdown
        ).map((n) => ({ value: n || 0 })),
      });
    }
    if (mode === "edit" && initialConsumption) {
      setConsumption(initialConsumption);
    }
    // Only re-run when modal opens or activity target changes to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, activityId, groupDefaults]);

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
    console.log("!! Loading batches for costing", costingId, productId);
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
        if (cost) void loadBatchesForCosting(cid, cost.component?.id ?? null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedCostings]);

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
          : "Record Activity"
      }
      size="xxl"
      centered
    >
      <form
        onSubmit={handleSubmit((values) => {
          const fd = new FormData();
          if (mode === "edit") {
            fd.set("_intent", "activity.update");
            if (activityId != null) fd.set("activityId", String(activityId));
          } else {
            fd.set(
              "_intent",
              overrideIntent
                ? overrideIntent
                : `activity.create.${activityType}`
            );
          }
          if (extraFields) {
            for (const [k, v] of Object.entries(extraFields)) {
              fd.set(k, String(v));
            }
          }
          const date = values.activityDate
            ? new Date(values.activityDate)
            : null;
          if (date) fd.set("activityDate", date.toISOString().slice(0, 10));
          const qb = (values.qtyBreakdown || []).map(
            (x) => Number(x?.value || 0) | 0
          );
          fd.set("qtyBreakdown", JSON.stringify(qb));
          const consumptionsArr = Object.keys(consumption)
            .map((k) => Number(k))
            .filter((cid) => Object.keys(consumption[cid] || {}).length > 0)
            .map((cid: number) => ({
              costingId: cid,
              lines: Object.entries(consumption[cid] || {}).map(
                ([batchId, q]) => ({
                  batchId: Number(batchId),
                  qty: Number(q) || 0,
                })
              ),
            }));
          fd.set("consumptions", JSON.stringify(consumptionsArr));
          submit(fd, { method: "post" });
          onClose();
        })}
      >
        <Stack p="lg">
          <Group align="flex-end" justify="space-between">
            <Controller
              control={control}
              name="activityDate"
              render={({ field }) => (
                <DatePickerInput
                  label="Date"
                  value={field.value}
                  onChange={(v: any) => field.onChange((v as any) ?? null)}
                  valueFormat="YYYY-MM-DD"
                  required
                />
              )}
            />
            <Button type="submit" variant="filled">
              Save
            </Button>
          </Group>
          <Stack>
            {groupDefaults && groupDefaults.length > 0 ? (
              <Stack>
                {(qtyGroupArray.fields || []).map((fg, gi) => {
                  const gDef = groupDefaults![gi];
                  const glabels = gDef?.labels || [];
                  return (
                    <Stack key={`g-${fg.id || gi}`}>
                      <Group justify="space-between" align="center">
                        <Title order={6}>Assembly A{gDef.assemblyId}</Title>
                      </Group>
                      <Table
                        withColumnBorders
                        withTableBorder
                        striped
                        style={{ tableLayout: "fixed" }}
                      >
                        <Table.Thead>
                          <Table.Tr>
                            {glabels.map((label: string, i: number) => (
                              <Table.Th
                                key={`gh-${gi}-${i}`}
                                ta="center"
                                py={2}
                                fz="xs"
                                style={{
                                  width: 56,
                                }}
                              >
                                {label || `${i + 1}`}
                              </Table.Th>
                            ))}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          <Table.Tr>
                            {glabels.map((_label: string, i: number) => (
                              <Table.Td
                                key={`gqty-${gi}-${i}`}
                                p={0}
                                ta="center"
                                style={{ position: "relative", width: 56 }}
                              >
                                <Controller
                                  control={control}
                                  name={
                                    `qtyGroup.${gi}.qtyBreakdown.${i}.value` as const
                                  }
                                  render={({ field }) => (
                                    <TextInput
                                      type="number"
                                      variant="unstyled"
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
                                      value={field.value ?? 0}
                                      onChange={(e) => {
                                        const raw = e.currentTarget.value;
                                        const v = raw === "" ? 0 : Number(raw);
                                        field.onChange(
                                          Number.isFinite(v)
                                            ? (v as number) | 0
                                            : 0
                                        );
                                      }}
                                    />
                                  )}
                                />
                              </Table.Td>
                            ))}
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
                    {labels.map((label: string, i: number) => (
                      <Table.Th
                        key={`h-${i}`}
                        ta="center"
                        style={{ width: 56 }}
                      >
                        {label || `${i + 1}`}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    {labels.map((_label: string, i: number) => (
                      <Table.Td
                        key={`qty-${i}`}
                        p={0}
                        ta="center"
                        style={{ position: "relative", width: 56 }}
                      >
                        <Controller
                          control={control}
                          name={`qtyBreakdown.${i}.value` as const}
                          render={({ field }) => (
                            <TextInput
                              type="number"
                              variant="unstyled"
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
                              value={field.value ?? 0}
                              onChange={(e) => {
                                const raw = e.currentTarget.value;
                                const v = raw === "" ? 0 : Number(raw);
                                field.onChange(
                                  Number.isFinite(v) ? (v as number) | 0 : 0
                                );
                              }}
                            />
                          )}
                        />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            )}
          </Stack>

          <Stack>
            <Title order={6}>Material Consumption</Title>
            <Group justify="space-between" align="center">
              <Group gap={8} align="center">
                <SegmentedControl
                  data={[
                    { label: "All", value: "all" },
                    { label: "Current", value: "current" },
                  ]}
                  size="xs"
                  value={batchScope}
                  onChange={(v) => setBatchScope(v as any)}
                />
                <SegmentedControl
                  data={(() => {
                    const locName = (
                      assembly?.job?.locationIn?.name || ""
                    ).trim();
                    const label = locName ? locName : "Job location";
                    return [
                      { label: "All", value: "all" },
                      { label, value: "job" },
                    ];
                  })()}
                  size="xs"
                  value={batchLocScope}
                  onChange={(v) => setBatchLocScope(v as any)}
                />
              </Group>
            </Group>
            {(() => {
              const qbSingle = watch("qtyBreakdown") || [];
              const qg = (watch("qtyGroup") || []) as any[];
              const unitsInCut =
                (qg.length
                  ? qg.reduce((t, g) => {
                      const arr = (g?.qtyBreakdown || []) as any[];
                      return (
                        t +
                        arr.reduce(
                          (tt: number, x: any) =>
                            tt + (Number(x?.value ?? 0) || 0),
                          0
                        )
                      );
                    }, 0)
                  : qbSingle.reduce(
                      (t: number, x: any) => t + (Number(x?.value ?? 0) || 0),
                      0
                    )) || 0;
              return (
                <Accordion
                  multiple
                  value={openedCostings}
                  onChange={(vals) => setOpenedCostings(vals as string[])}
                  variant="contained"
                >
                  {eligibleCostings.map((c) => {
                    const cid = c.id;
                    const compId = c.component?.id ?? null;
                    const compSku = c.component?.sku ?? "";
                    const compName = c.component?.name ?? "";
                    const consumed = Object.values(
                      consumption[cid] || {}
                    ).reduce((t, n) => t + (Number(n) || 0), 0);
                    const expected = (c.quantityPerUnit || 0) * unitsInCut;
                    const headerLeft = (
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
                    );
                    const headerRight = (
                      <Group gap={4} wrap="nowrap" align="center" ml="auto">
                        <Text inherit>{consumed}</Text>
                        <Text c="dimmed">/</Text>
                        <Text inherit>{expected}</Text>
                      </Group>
                    );
                    return (
                      <Accordion.Item key={cid} value={String(cid)}>
                        <Accordion.Control>
                          <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="center"
                          >
                            {headerLeft}
                            {headerRight}
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Group gap={8} mb={4}>
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
                              {(batchesByCosting[cid] || [])
                                .filter((b) =>
                                  batchScope === "current"
                                    ? (b.quantity ?? 0) > 0
                                    : true
                                )
                                .filter((b) => {
                                  if (batchLocScope === "all") return true;
                                  const jobLocId = (assembly?.job
                                    ?.locationInId ?? null) as number | null;
                                  if (!jobLocId) return true;
                                  return (b.location?.id ?? null) === jobLocId;
                                })
                                .map((b) => (
                                  <Table.Tr key={b.id}>
                                    <Table.Td>
                                      <ExternalLink href={`/batches/${b.id}`}>
                                        {b.id}
                                      </ExternalLink>
                                    </Table.Td>
                                    <Table.Td>
                                      {b.name ||
                                        b.codeMill ||
                                        b.codeSartor ||
                                        "(unnamed)"}
                                    </Table.Td>
                                    <Table.Td>
                                      {b.location?.name || ""}
                                    </Table.Td>
                                    <Table.Td>
                                      <Text
                                        style={{ cursor: "pointer" }}
                                        onClick={() => {
                                          const q =
                                            Number(b.quantity ?? 0) || 0;
                                          setConsumption((prev) => ({
                                            ...prev,
                                            [cid]: {
                                              ...(prev[cid] || {}),
                                              [b.id]: q,
                                            },
                                          }));
                                        }}
                                      >
                                        {b.quantity ?? 0}
                                      </Text>
                                    </Table.Td>
                                    <Table.Td>
                                      <TextInput
                                        w={100}
                                        type="number"
                                        value={consumption[cid]?.[b.id] ?? ""}
                                        onChange={(e) => {
                                          const raw = e.currentTarget.value;
                                          const v =
                                            raw === "" ? 0 : Number(raw);
                                          const max =
                                            Number(b.quantity ?? 0) || 0;
                                          const clamped = Number.isFinite(v)
                                            ? Math.max(
                                                0,
                                                Math.min(v as number, max)
                                              )
                                            : 0;
                                          setConsumption((prev) => ({
                                            ...prev,
                                            [cid]: {
                                              ...(prev[cid] || {}),
                                              [b.id]: clamped,
                                            },
                                          }));
                                        }}
                                      />
                                    </Table.Td>
                                  </Table.Tr>
                                ))}
                            </Table.Tbody>
                          </Table>
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                </Accordion>
              );
            })()}
          </Stack>
        </Stack>
      </form>
    </Modal>
  );
}
