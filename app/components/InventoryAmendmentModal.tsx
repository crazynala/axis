import { useEffect, useMemo } from "react";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  SegmentedControl,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useSubmit } from "@remix-run/react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

export type BatchRowLite = {
  batchId: number;
  locationId: number | null;
  locationName?: string | null;
  name?: string | null;
  codeMill?: string | null;
  codeSartor?: string | null;
  qty: number; // current qty snapshot
};

type BulkRow = BatchRowLite & { target: number };

export function InventoryAmendmentModal(props: {
  opened: boolean;
  onClose: () => void;
  productId: number;
  mode: "batch" | "product";
  date?: Date | null;
  // Batch mode
  batch?: BatchRowLite | null;
  // Product mode
  batches?: BatchRowLite[];
}) {
  const { opened, onClose, productId, mode, date, batch, batches } = props;
  const submit = useSubmit();
  type CreateRow = {
    name?: string;
    codeMill?: string;
    codeSartor?: string;
    locationId: number | null;
    qty: number;
  };

  const form = useForm<{
    when: Date | null;
    scope: "all" | "nonzero";
    newQty: number | ""; // batch mode
    rows: BulkRow[]; // product mode existing batches
    newRows: CreateRow[]; // product mode creations
  }>({
    defaultValues: {
      when: date ?? new Date(),
      scope: "nonzero",
      newQty: batch ? batch.qty : 0,
      rows: (batches || []).map((b) => ({ ...b, target: b.qty })),
      newRows: [],
    },
    mode: "onChange",
  });

  const { control, handleSubmit, watch } = form;
  const rowsFA = useFieldArray({ control, name: "rows" });
  const newRowsFA = useFieldArray({ control, name: "newRows" });

  // Reset the form whenever inputs change (modal can open with different data)
  useEffect(() => {
    if (!opened) return;
    const defaults = {
      when: date ?? new Date(),
      scope: "nonzero" as const,
      newQty: batch ? batch.qty : 0,
      rows: (batches || []).map((b) => ({ ...b, target: b.qty })),
      newRows: [] as CreateRow[],
    };
    form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, mode, date, batch, batches]);

  const when = watch("when");
  const scope = watch("scope");
  const rows = watch("rows");
  const newRows = watch("newRows");
  const newQty = watch("newQty");

  const delta = useMemo(() => {
    if (mode !== "batch" || !batch) return 0;
    const nv = Number(newQty || 0);
    return Math.round((nv - (batch?.qty || 0)) * 100) / 100;
  }, [mode, batch, newQty]);

  type RowWithIndex = { row: BulkRow; idx: number };
  const filteredRows = useMemo(() => {
    if (mode !== "product") return [] as RowWithIndex[];
    const base = rows.map((r, i) => ({ row: r, idx: i }));
    let filteredRows = base;
    if (scope === "nonzero") {
      filteredRows = base.filter(
        ({ row }) =>
          // current non-zero
          Math.round(row.qty * 100) / 100 !== 0 ||
          // or target changed
          row.target !== row.qty
      );
    } else if (scope === "adjusted") {
      filteredRows = base.filter(
        ({ row }) =>
          // target changed
          row.target !== row.qty
      );
    }
    return filteredRows;
  }, [mode, rows, scope]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={mode === "batch" ? "Amend Batch Quantity" : "Amend Product Stock"}
      size={mode === "batch" ? "md" : "lg"}
      centered
    >
      {mode === "batch" && batch && (
        <Stack>
          <Group justify="space-between">
            <Controller
              control={control}
              name="when"
              render={({ field }) => (
                <DatePickerInput
                  label="Date"
                  value={field.value}
                  onChange={(d) => field.onChange((d as any) ?? null)}
                  valueFormat="YYYY-MM-DD"
                  required
                />
              )}
            />
            <Button
              onClick={handleSubmit((vals) => {
                const fd = new FormData();
                fd.set("_intent", "inventory.amend.batch");
                fd.set("productId", String(productId));
                fd.set("batchId", String(batch.batchId));
                fd.set("locationId", String(batch.locationId ?? ""));
                if (vals.when)
                  fd.set(
                    "date",
                    new Date(vals.when).toISOString().slice(0, 10)
                  );
                const d =
                  Math.round(
                    (Number(vals.newQty || 0) - (batch.qty || 0)) * 100
                  ) / 100;
                fd.set("delta", String(d));
                submit(fd, { method: "post" });
                onClose();
              })}
              disabled={!when}
            >
              Save
            </Button>
          </Group>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Batch</Table.Th>
                <Table.Th>Location</Table.Th>
                <Table.Th>Current</Table.Th>
                <Table.Th>New</Table.Th>
                <Table.Th>Delta</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  {batch.name ||
                    batch.codeMill ||
                    batch.codeSartor ||
                    batch.batchId}
                </Table.Td>
                <Table.Td>
                  {batch.locationName || batch.locationId || ""}
                </Table.Td>
                <Table.Td>{batch.qty}</Table.Td>
                <Table.Td>
                  <Controller
                    control={control}
                    name="newQty"
                    render={({ field }) => (
                      <NumberInput
                        value={field.value as any}
                        onChange={(v) => field.onChange(Number(v) || 0)}
                        hideControls
                        w={100}
                      />
                    )}
                  />
                </Table.Td>
                <Table.Td>{delta}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Stack>
      )}
      {mode === "product" && (
        <Stack>
          <Group justify="space-between" align="center">
            <Controller
              control={control}
              name="when"
              render={({ field }) => (
                <DatePickerInput
                  label="Date"
                  value={field.value}
                  onChange={(d) => field.onChange((d as any) ?? null)}
                  valueFormat="YYYY-MM-DD"
                  required
                />
              )}
            />
            <Group gap={8} align="center">
              <Controller
                control={control}
                name="scope"
                render={({ field }) => (
                  <SegmentedControl
                    data={[
                      { label: "All", value: "all" },
                      { label: "Current", value: "nonzero" },
                      { label: "Adjusted", value: "adjusted" },
                    ]}
                    size="xs"
                    value={field.value}
                    onChange={(v) => field.onChange(v as any)}
                  />
                )}
              />
              <Button
                onClick={handleSubmit((vals) => {
                  const visibleRows = (
                    vals.scope === "nonzero"
                      ? vals.rows.filter(
                          (r) =>
                            Math.round((r.target - r.qty) * 100) / 100 !== 0
                        )
                      : vals.rows
                  ) as BulkRow[];
                  const changes = visibleRows.map((r) => ({
                    batchId: r.batchId,
                    locationId: r.locationId,
                    delta: Math.round((r.target - r.qty) * 100) / 100,
                  }));
                  const creates = (vals.newRows || [])
                    .filter((r) => Number(r.qty) > 0)
                    .map((r) => ({
                      name: r.name || null,
                      codeMill: r.codeMill || null,
                      codeSartor: r.codeSartor || null,
                      locationId: r.locationId,
                      qty: Number(r.qty) || 0,
                    }));
                  const fd = new FormData();
                  fd.set("_intent", "inventory.amend.product");
                  fd.set("productId", String(productId));
                  if (vals.when)
                    fd.set(
                      "date",
                      new Date(vals.when).toISOString().slice(0, 10)
                    );
                  fd.set("changes", JSON.stringify(changes));
                  fd.set("creates", JSON.stringify(creates));
                  submit(fd, { method: "post" });
                  onClose();
                })}
                disabled={!when}
              >
                Save
              </Button>
            </Group>
          </Group>

          <Title order={6}>Existing Batches</Title>
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Batch</Table.Th>
                <Table.Th>Location</Table.Th>
                <Table.Th>Current</Table.Th>
                <Table.Th>Target</Table.Th>
                <Table.Th>Delta</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRows.map(({ row, idx }) => (
                <Table.Tr key={row.batchId}>
                  <Table.Td>
                    {row.name || row.codeMill || row.codeSartor || row.batchId}
                  </Table.Td>
                  <Table.Td>
                    {row.locationName || row.locationId || ""}
                  </Table.Td>
                  <Table.Td>{row.qty}</Table.Td>
                  <Table.Td>
                    <Controller
                      control={control}
                      name={`rows.${idx}.target` as const}
                      render={({ field }) => (
                        <NumberInput
                          value={field.value as any}
                          onChange={(v) => field.onChange(Number(v) || 0)}
                          hideControls
                          w={100}
                        />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>
                    {Math.round((row.target - row.qty) * 100) / 100}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Title order={6}>Create New Batches</Title>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Mill</Table.Th>
                <Table.Th>Sartor</Table.Th>
                <Table.Th>Location ID</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {newRows.map((r, idx) => (
                <Table.Tr key={idx}>
                  <Table.Td>
                    <Controller
                      control={control}
                      name={`newRows.${idx}.name` as const}
                      render={({ field }) => (
                        <TextInput {...field} value={field.value || ""} />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Controller
                      control={control}
                      name={`newRows.${idx}.codeMill` as const}
                      render={({ field }) => (
                        <TextInput {...field} value={field.value || ""} />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Controller
                      control={control}
                      name={`newRows.${idx}.codeSartor` as const}
                      render={({ field }) => (
                        <TextInput {...field} value={field.value || ""} />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Controller
                      control={control}
                      name={`newRows.${idx}.locationId` as const}
                      render={({ field }) => (
                        <NumberInput
                          value={(field.value as any) ?? null}
                          onChange={(v) =>
                            field.onChange(
                              v === "" || v == null ? null : (Number(v) as any)
                            )
                          }
                          hideControls
                          w={100}
                        />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Controller
                      control={control}
                      name={`newRows.${idx}.qty` as const}
                      render={({ field }) => (
                        <NumberInput
                          value={field.value as any}
                          onChange={(v) => field.onChange(Number(v) || 0)}
                          hideControls
                          w={100}
                        />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button
                      variant="light"
                      color="red"
                      size="xs"
                      onClick={() => newRowsFA.remove(idx)}
                    >
                      Remove
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      newRowsFA.append({
                        name: "",
                        codeMill: "",
                        codeSartor: "",
                        locationId: null,
                        qty: 0,
                      })
                    }
                  >
                    Add Row
                  </Button>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Modal>
  );
}
