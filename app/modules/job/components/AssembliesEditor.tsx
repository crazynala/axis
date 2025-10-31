import {
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Modal,
} from "@mantine/core";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { useInitGlobalFormContext } from "@aa/timber";
import { useSubmit } from "@remix-run/react";
import { AssemblyQuantitiesCard } from "~/modules/job/components/AssemblyQuantitiesCard";
import { AssemblyCostingsTable } from "~/modules/job/components/AssemblyCostingsTable";
import {
  buildCostingRows,
  canEditQpuDefault,
} from "~/modules/job/services/costingsView";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { assemblyStateConfig } from "~/base/state/configs";
import { AssemblyActivityModal } from "~/components/AssemblyActivityModal";

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

export function AssembliesEditor(props: {
  mode?: "assembly" | "group";
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
  // Group-only extras
  groupMovements?: any[];
  groupContext?: { jobId: number; groupId: number } | null;
}) {
  const {
    mode = "assembly",
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
    groupMovements,
    groupContext,
  } = props;
  const submit = useSubmit();
  const isGroup = mode === "group" || assemblies.length > 1;
  const firstAssembly = assemblies[0];
  const [cutOpen, setCutOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<null | any>(null);
  const editForm = useForm<{
    orderedByAssembly: Record<string, number[]>;
    qpu: Record<string, number>;
    activity: Record<string, string>;
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
    },
  });
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
      },
      { keepDirty: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assemblies?.map((a) => a.id).join(",")]);

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
    })
  );

  return (
    <>
      {/* Top controls: per-assembly state and record cut */}
      <Card withBorder padding="sm" mb="md">
        <Group justify="space-between" align="center">
          <Group wrap="wrap" gap="sm">
            {(assemblies as any[]).map((a) => (
              <Group key={`ctrl-${a.id}`} gap="xs" align="center">
                <Title order={6}>A{a.id}</Title>
                <StateChangeButton
                  value={(a as any).status || "DRAFT"}
                  defaultValue={(a as any).status || "DRAFT"}
                  onChange={(v) => {
                    const fd = new FormData();
                    fd.set(
                      "_intent",
                      stateChangeIntent ||
                        (isGroup
                          ? "assembly.update.fromGroup"
                          : "assembly.update")
                    );
                    fd.set("assemblyId", String(a.id));
                    if ((a as any).name)
                      fd.set("name", String((a as any).name));
                    fd.set("status", v);
                    submit(fd, { method: "post" });
                  }}
                  config={assemblyStateConfig}
                />
              </Group>
            ))}
          </Group>
          <Button size="xs" variant="light" onClick={() => setCutOpen(true)}>
            {isGroup ? "Record Group Cut" : "Record Cut"}
          </Button>
        </Group>
      </Card>

      <Grid>
        {/* Assembly info card (single assembly only) */}
        {!isGroup ? (
          <Grid.Col span={5}>
            <Card withBorder padding="md">
              <Card.Section inheritPadding py="xs">
                <Title order={4}>Assembly</Title>
              </Card.Section>
              <Divider my="xs" />
              <Stack gap={6}>
                <TextInput
                  readOnly
                  value={firstAssembly?.name || ""}
                  label="Name"
                  mod="data-autosize"
                />
                <TextInput
                  readOnly
                  value={job?.name || job?.id || ""}
                  label="Job"
                  mod="data-autosize"
                />
                <TextInput
                  readOnly
                  value={firstAssembly?.status || ""}
                  label="Status"
                  mod="data-autosize"
                />
                <TextInput
                  readOnly
                  value={firstAssembly?.id || ""}
                  label="ID"
                  mod="data-autosize"
                />
              </Stack>
            </Card>
          </Grid.Col>
        ) : null}

        {(assemblies || []).map((a) => {
          const item = (quantityItems || []).find((i) => i.assemblyId === a.id);
          if (!item) return null;
          return (
            <Grid.Col span={isGroup ? 6 : 7} key={a.id}>
              <AssemblyQuantitiesCard
                title={`Quantities — Assembly ${a.id}`}
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
              />
            </Grid.Col>
          );
        })}
        <Grid.Col span={12}>
          <AssemblyCostingsTable
            title={isGroup ? "Costings (Group)" : "Costings"}
            actions={[
              <AddCostingButton
                products={products}
                jobId={job?.id || 0}
                assemblyId={firstAssembly?.id || 0}
              />,
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
        {!isGroup ? (
          <Grid.Col span={12}>
            <Card withBorder padding="md">
              <Card.Section inheritPadding py="xs">
                <Title order={4}>Activity History</Title>
              </Card.Section>
              <Divider my="xs" />
              <Table striped withTableBorder withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Job</Table.Th>
                    <Table.Th>End</Table.Th>
                    {(() => {
                      const raw =
                        (firstAssembly?.variantSet?.variants?.length
                          ? (firstAssembly?.variantSet?.variants as any)
                          : activityVariantLabels) || [];
                      let last = -1;
                      for (let i = raw.length - 1; i >= 0; i--) {
                        const s = (raw[i] || "").toString().trim();
                        if (s) {
                          last = i;
                          break;
                        }
                      }
                      const cnum = (firstAssembly as any)?.c_numVariants as
                        | number
                        | undefined;
                      const effectiveLen = Math.max(
                        0,
                        Math.min(
                          typeof cnum === "number" && cnum > 0
                            ? cnum
                            : raw.length,
                          last + 1
                        )
                      );
                      const cols = raw.slice(0, effectiveLen);
                      const headers = cols.length
                        ? cols
                        : (
                            (activities || []).find((a: any) =>
                              Array.isArray(a.qtyBreakdown)
                            )?.qtyBreakdown || []
                          ).map((_x: any, i: number) => `${i + 1}`);
                      return headers.map((label: string, idx: number) => (
                        <Table.Th key={`vcol-${idx}`}>
                          {label || `${idx + 1}`}
                        </Table.Th>
                      ));
                    })()}
                    <Table.Th>Notes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(activities || []).map((a: any) => {
                    const raw =
                      (firstAssembly?.variantSet?.variants?.length
                        ? (firstAssembly?.variantSet?.variants as any)
                        : activityVariantLabels) || [];
                    let last = -1;
                    for (let i = raw.length - 1; i >= 0; i--) {
                      const s = (raw[i] || "").toString().trim();
                      if (s) {
                        last = i;
                        break;
                      }
                    }
                    const cnum = (firstAssembly as any)?.c_numVariants as
                      | number
                      | undefined;
                    const effectiveLen = Math.max(
                      0,
                      Math.min(
                        typeof cnum === "number" && cnum > 0
                          ? cnum
                          : raw.length,
                        last + 1
                      )
                    );
                    const labels = raw.slice(0, effectiveLen);
                    const breakdown = (a.qtyBreakdown || []) as number[];
                    const cols = labels.length
                      ? labels
                      : breakdown.map((_x: any, i: number) => `${i + 1}`);
                    return (
                      <Table.Tr
                        key={a.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setEditActivity(a);
                          setCutOpen(true);
                        }}
                      >
                        <Table.Td>{a.id}</Table.Td>
                        <Table.Td>{a.name}</Table.Td>
                        <Table.Td>{a.job?.name || a.jobId}</Table.Td>
                        <Table.Td>
                          {a.endTime
                            ? new Date(a.endTime).toLocaleString()
                            : ""}
                        </Table.Td>
                        {cols.map((_label: string, idx: number) => (
                          <Table.Td key={`${a.id}-qty-${idx}`}>
                            {breakdown[idx] ? breakdown[idx] : ""}
                          </Table.Td>
                        ))}
                        <Table.Td>{a.notes}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>
        ) : (
          <Grid.Col span={12}>
            <Card withBorder padding="md">
              <Card.Section inheritPadding py="xs">
                <Title order={4}>Group Activity & Movements (read-only)</Title>
              </Card.Section>
              <Divider my="xs" />
              <div>
                {!(groupMovements || []).length ? (
                  <div style={{ padding: 8 }}>
                    No group-level movements yet.
                  </div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {(groupMovements || []).map((m: any) => (
                      <li key={m.id}>
                        {new Date(m.date).toLocaleString()} —{" "}
                        {m.movementType || "Movement"} — Qty{" "}
                        {String(m.quantity || "")}{" "}
                        {m.groupKey ? `(key ${m.groupKey})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </Grid.Col>
        )}
      </Grid>

      {/* Activity Modals */}
      {!isGroup ? (
        <AssemblyActivityModal
          opened={cutOpen}
          onClose={() => {
            setCutOpen(false);
            setEditActivity(null);
          }}
          assembly={firstAssembly}
          productVariantSet={{ variants: activityVariantLabels || [] } as any}
          costings={(firstAssembly?.costings || []) as any}
          activityType={
            editActivity &&
            String(editActivity?.activityType || editActivity?.name || "")
              .toLowerCase()
              .includes("make")
              ? "make"
              : editActivity &&
                String(editActivity?.activityType || editActivity?.name || "")
                  .toLowerCase()
                  .includes("pack")
              ? "pack"
              : "cut"
          }
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
        />
      ) : (
        firstAssembly && (
          <AssemblyActivityModal
            opened={cutOpen}
            onClose={() => setCutOpen(false)}
            assembly={firstAssembly}
            productVariantSet={
              {
                variants:
                  (quantityItems.find((i) => i.assemblyId === firstAssembly.id)
                    ?.variants?.labels as any) || [],
              } as any
            }
            groupQtyItems={(assemblies as any[]).map((a: any) => {
              const it = (quantityItems as any[]).find(
                (i) => i.assemblyId === a.id
              );
              return {
                assemblyId: a.id,
                variants: { labels: it?.variants?.labels || [] },
                ordered: it?.ordered || [],
                cut: it?.cut || [],
              };
            })}
            costings={
              ((firstAssembly as any).costings || []).map((c: any) => ({
                ...c,
                component: c.product ?? null,
              })) as any
            }
            activityType="cut"
            mode="create"
            overrideIntent="group.activity.create.cut"
            extraFields={{
              groupId: groupContext?.groupId || 0,
              jobId: groupContext?.jobId || 0,
            }}
          />
        )
      )}
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
      <Modal.Root
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
      </Modal.Root>
    </>
  );
}
