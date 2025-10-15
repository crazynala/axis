import { useEffect, useMemo, useState } from "react";
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
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useFetcher } from "@remix-run/react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import type { Control, UseFormWatch } from "react-hook-form";

type ReceiveForm = {
  date: string; // YYYY-MM-DD
  items: Array<{
    lineId: number;
    productId: number;
    total: number;
    batches: Array<{
      name?: string;
      codeMill?: string;
      codeSartor?: string;
      qty: number;
    }>;
  }>;
};

export function POReceiveModal(props: {
  opened: boolean;
  onClose: () => void;
  poId: number;
  poLocationId: number | null; // all created batches should use this
  lines: Array<{
    id: number;
    productId: number;
    sku?: string | null;
    name?: string | null;
    qtyOrdered?: number | null;
    qtyReceived?: number | null;
  }>;
}) {
  const { opened, onClose, poId, poLocationId, lines } = props;
  const fetcher = useFetcher<{ error?: string }>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Build remaining map from props
  const remainingByLine = useMemo(
    () =>
      Object.fromEntries(
        lines.map((l) => [
          l.id,
          Math.max(0, Number(l.qtyOrdered || 0) - Number(l.qtyReceived || 0)),
        ])
      ),
    [lines]
  );

  // Setup RHF
  const defaultValues: ReceiveForm = useMemo(
    () => ({
      date: new Date().toISOString().slice(0, 10),
      items: lines.map((l) => ({
        lineId: l.id,
        productId: l.productId,
        total: 0,
        batches: [],
      })),
    }),
    [lines]
  );
  const form = useForm<ReceiveForm>({
    defaultValues,
    mode: "onChange",
  });
  const { control, handleSubmit, watch, reset, setValue } = form;
  useEffect(() => {
    if (opened) {
      reset(defaultValues);
      setServerError(null);
      setSubmitted(false);
    }
  }, [opened, defaultValues, reset]);

  const items = watch("items");
  const dateStr = watch("date");
  const canSave = useMemo(() => {
    if (!Array.isArray(items)) return false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const rem = Number(remainingByLine[it.lineId] || 0);
      const total = Number(it.total || 0);
      const rows = Array.isArray(it.batches) ? it.batches : [];
      if (rows.length === 0 && total === 0) continue;
      if (rows.length === 0 && total > 0) return false;
      const sum = rows.reduce((t, r) => t + (Number(r.qty) || 0), 0);
      if (Math.round(sum * 100) !== Math.round(total * 100)) return false;
      if (total > rem) return false;
    }
    return true;
  }, [items, remainingByLine]);

  // Build first failing reason to show in tooltip
  const disableReason = useMemo(() => {
    if (!dateStr) return "Pick a date";
    if (!Array.isArray(items)) return "No items to receive";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const line = lines[i];
      const label = line?.sku || line?.name || `Line ${line?.id}` || "line";
      const rem = Number(remainingByLine[it.lineId] || 0);
      const total = Number(it.total || 0);
      const rows = Array.isArray(it.batches) ? it.batches : [];
      if (rows.length === 0 && total > 0) return `Add batch rows for ${label}`;
      if (rows.length > 0) {
        const sum = rows.reduce((t, r) => t + (Number(r?.qty) || 0), 0);
        if (Math.round(sum * 100) !== Math.round(total * 100))
          return `Sum of batches must equal total for ${label}`;
      }
      if (total > rem) return `Total exceeds remaining for ${label}`;
    }
    return "";
  }, [dateStr, items, lines, remainingByLine]);

  const onSubmit = (vals: ReceiveForm) => {
    const payload = vals.items
      .map((it) => {
        const total = Number(it.total || 0);
        const rows = Array.isArray(it.batches) ? it.batches : [];
        if (total <= 0 || rows.length === 0) return null;
        return {
          lineId: it.lineId,
          productId: it.productId,
          total,
          batches: rows.map((r) => ({
            name: r.name || null,
            codeMill: r.codeMill || null,
            codeSartor: r.codeSartor || null,
            qty: Number(r.qty) || 0,
          })),
        };
      })
      .filter(Boolean);
    const fd = new FormData();
    fd.set("_intent", "po.receive");
    fd.set("poId", String(poId));
    fd.set("date", vals.date);
    fd.set("payload", JSON.stringify(payload));
    fd.set("locationId", String(poLocationId ?? ""));
    setSubmitted(true);
    fetcher.submit(fd, { method: "post" });
  };

  // Show server error, and close only on successful redirect
  useEffect(() => {
    if (submitted && fetcher.state === "idle") {
      if (fetcher.data && (fetcher.data as any).error) {
        setServerError((fetcher.data as any).error as string);
      } else if (fetcher.data == null) {
        // Likely a redirect occurred => success, close and reset
        if (opened) onClose();
        setServerError(null);
        setSubmitted(false);
      }
    }
  }, [submitted, fetcher.state, fetcher.data, opened, onClose]);

  // Reset error state when opening the modal
  useEffect(() => {
    if (opened) {
      setServerError(null);
      setSubmitted(false);
    }
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Receive Purchase Order"
      size="lg"
      centered
    >
      <Stack>
        {serverError ? (
          <Text c="red" size="sm">
            {serverError}
          </Text>
        ) : null}
        <Group justify="space-between" align="center">
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DatePickerInput
                label="Date"
                value={field.value ? new Date(field.value) : null}
                onChange={(d) =>
                  field.onChange(
                    d ? new Date(d as any).toISOString().slice(0, 10) : ""
                  )
                }
                valueFormat="YYYY-MM-DD"
                required
              />
            )}
          />
          <Tooltip withArrow label={disableReason} disabled={!disableReason}>
            <div>
              <Button
                onClick={handleSubmit(onSubmit)}
                disabled={!!disableReason}
              >
                Save
              </Button>
            </div>
          </Tooltip>
        </Group>
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Ordered</Table.Th>
              <Table.Th>Received</Table.Th>
              <Table.Th>Remaining</Table.Th>
              <Table.Th>Total to Receive</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l, idx) => (
              <Table.Tr key={l.id}>
                <Table.Td>{l.sku || ""}</Table.Td>
                <Table.Td>{l.name || ""}</Table.Td>
                <Table.Td>{Number(l.qtyOrdered || 0)}</Table.Td>
                <Table.Td>{Number(l.qtyReceived || 0)}</Table.Td>
                <Table.Td>{Number(remainingByLine[l.id] || 0)}</Table.Td>
                <Table.Td>
                  <Controller
                    control={control}
                    name={`items.${idx}.total` as const}
                    render={({ field }) => (
                      <NumberInput
                        value={field.value as any}
                        min={0}
                        max={(remainingByLine[l.id] || 0) as any}
                        onChange={(v) => {
                          const r = Number(remainingByLine[l.id] || 0);
                          const nv = Math.max(0, Math.min(Number(v) || 0, r));
                          field.onChange(nv);
                        }}
                        w={100}
                        hideControls
                      />
                    )}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Title order={6}>Batch Breakdown</Title>
        {lines.map((l, idx) => (
          <LineBatchesSection
            key={`bd-${l.id}`}
            control={control}
            watch={watch}
            idx={idx}
            line={l}
            remaining={Number(remainingByLine[l.id] || 0)}
          />
        ))}
        <Text c="dimmed" size="sm">
          All batches created here will use the PO's location ID:{" "}
          {poLocationId ?? "(none)"}.
        </Text>
      </Stack>
    </Modal>
  );
}

function LineBatchesSection(props: {
  control: Control<ReceiveForm>;
  watch: UseFormWatch<ReceiveForm>;
  idx: number;
  line: { id: number; sku?: string | null; name?: string | null };
  remaining: number;
}) {
  const { control, watch, idx, line, remaining } = props;
  // Hook lives inside a dedicated component to keep parent's hook order stable
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${idx}.batches` as const,
  });

  const batches = (watch(`items.${idx}.batches` as const) as any[]) || [];
  const sum = Array.isArray(batches)
    ? batches.reduce((t: number, r: any) => t + (Number(r?.qty) || 0), 0)
    : 0;
  const total = Number((watch(`items.${idx}.total` as const) as any) || 0);
  const rem = Number(remaining || 0);
  const needsBatches = total > 0 && batches.length === 0;
  const sumMismatch = Math.round(sum * 100) !== Math.round(total * 100);
  const exceedsRemaining = total > rem;
  const ok = !needsBatches && !sumMismatch && !exceedsRemaining;

  return (
    <Stack gap={6}>
      <Group justify="space-between" align="center">
        <Text fw={600}>
          {line.sku || ""} · {line.name || ""}
        </Text>
        <Text size="sm" c={ok ? "dimmed" : "red"}>
          Sum: {sum} / {total} — Remaining: {rem}
        </Text>
      </Group>
      {!ok && (
        <Stack gap={2}>
          {needsBatches && (
            <Text size="xs" c="red">
              Add at least one batch row for this line.
            </Text>
          )}
          {!needsBatches && sumMismatch && (
            <Text size="xs" c="red">
              Sum of batch qty must equal Total to Receive.
            </Text>
          )}
          {exceedsRemaining && (
            <Text size="xs" c="red">
              Total to Receive exceeds Remaining.
            </Text>
          )}
        </Stack>
      )}
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Mill</Table.Th>
            <Table.Th>Sartor</Table.Th>
            <Table.Th>Qty</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {fields.map((f, bIdx) => (
            <Table.Tr key={f.id}>
              <Table.Td>
                <Controller
                  control={control}
                  name={`items.${idx}.batches.${bIdx}.name` as const}
                  render={({ field }) => (
                    <TextInput
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Table.Td>
              <Table.Td>
                <Controller
                  control={control}
                  name={`items.${idx}.batches.${bIdx}.codeMill` as const}
                  render={({ field }) => (
                    <TextInput
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Table.Td>
              <Table.Td>
                <Controller
                  control={control}
                  name={`items.${idx}.batches.${bIdx}.codeSartor` as const}
                  render={({ field }) => (
                    <TextInput
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Table.Td>
              <Table.Td>
                <Controller
                  control={control}
                  name={`items.${idx}.batches.${bIdx}.qty` as const}
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
                  onClick={() => remove(bIdx)}
                >
                  Remove
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td colSpan={5}>
              <Button
                size="xs"
                variant="light"
                onClick={() =>
                  append({
                    name: "",
                    codeMill: "",
                    codeSartor: "",
                    qty: 0,
                  })
                }
              >
                Add Batch Row
              </Button>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
