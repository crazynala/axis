import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
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
import {
  useForm,
  Controller,
  useFieldArray,
  type Control,
  type UseFormWatch,
} from "react-hook-form";
import { useFetcher } from "@remix-run/react";
import EmbeddedTextInput from "./EmbeddedTextInput";
import { flushSync } from "react-dom";

type ReceiveForm = {
  date: string;
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
  // Track if the user attempted to save to control when to show inline errors
  const [attemptedSave, setAttemptedSave] = useState(false);

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
      setAttemptedSave(false);
    }
  }, [opened, defaultValues, reset]);

  const items = watch("items");
  const dateStr = watch("date");
  // Last validation failure reason (shown in tooltip after a failed Save)
  const [failReason, setFailReason] = useState<string>("");

  const validateAll = (): string => {
    if (!dateStr) return "Pick a date";
    if (!Array.isArray(items)) return "No items to receive";
    for (let i = 0; i < items.length; i++) {
      const it: any = items[i];
      const line = lines[i];
      const label = line?.sku || line?.name || `Line ${line?.id}` || "line";
      const total = Number(it?.total || 0);
      const rows = Array.isArray(it?.batches) ? it.batches : [];
      if (rows.length === 0 && total === 0) continue; // ignore untouched lines
      const anyNonEmpty = rows.some((r: any) => {
        if (!r) return false;
        const hasText = !!(
          (r.name && String(r.name).trim()) ||
          (r.codeMill && String(r.codeMill).trim()) ||
          (r.codeSartor && String(r.codeSartor).trim())
        );
        const hasQty = Number(r.qty || 0) > 0;
        return hasText || hasQty;
      });
      if (!anyNonEmpty && total > 0) return `Add batch rows for ${label}`;
      const sum = rows.reduce(
        (t: number, r: any) => t + (Number(r?.qty) || 0),
        0
      );
      if (Math.round(sum * 100) !== Math.round(total * 100))
        return `Sum of batches must equal total for ${label}`;
      // Overages allowed: no remaining check
    }
    return "";
  };

  // Reset failure reason on open/reset
  useEffect(() => {
    if (opened) setFailReason("");
  }, [opened]);

  const trySave = () => {
    setAttemptedSave(true);
    const reason = validateAll();
    setFailReason(reason);
    if (!reason) {
      // Invoke RHF submit handler only when our custom validations pass
      handleSubmit(onSubmit)();
      // Close immediately (optimistic) instead of waiting for server response
      // Server errors (if any) will be handled silently; could surface via a global notification if needed.
      if (opened) onClose();
    }
  };

  const onSubmit = (vals: ReceiveForm) => {
    const payload = vals.items
      .map((it) => {
        const total = Number(it.total || 0);
        const rows = (Array.isArray(it.batches) ? it.batches : []).filter(
          (r) => Number(r?.qty || 0) > 0
        );
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

  // Show server error, and close modal on successful save (redirect or JSON ok)
  useEffect(() => {
    if (submitted && fetcher.state === "idle") {
      if (fetcher.data && (fetcher.data as any).error) {
        setServerError((fetcher.data as any).error as string);
      } else {
        // Success: either redirect (data == null) or JSON ok (no error)
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
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      size="xl"
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
                mod="data-autosize"
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
          <Tooltip withArrow label={failReason} disabled={!failReason}>
            <div>
              <Group gap="xs">
                <Button variant="default" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={trySave}>Save</Button>
              </Group>
            </div>
          </Tooltip>
        </Group>
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Remaining</Table.Th>
              <Table.Th>Total to Receive</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l, idx) => (
              <Table.Tr key={l.id}>
                <Table.Td>{l.sku || ""}</Table.Td>
                <Table.Td>{l.name || ""}</Table.Td>
                <Table.Td>{Number(remainingByLine[l.id] || 0)}</Table.Td>
                <Table.Td>
                  <Controller
                    control={control}
                    name={`items.${idx}.total` as const}
                    render={({ field }) => (
                      <EmbeddedTextInput
                        type="number"
                        value={field.value as any}
                        onChange={(e) => {
                          const raw = (e.currentTarget?.value ?? "").toString();
                          const num = Number(raw);
                          // Allow overages; only clamp to >= 0
                          const nv = Math.max(
                            0,
                            Number.isFinite(num) ? num : 0
                          );
                          field.onChange(nv);
                        }}
                        w={100}
                      />
                    )}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {Array.isArray(items) &&
          items.some((it) => Number(it?.total || 0) > 0) && (
            <Title order={6}>Batch Breakdown</Title>
          )}
        {lines.map((l, idx) =>
          Number(items?.[idx]?.total || 0) > 0 ? (
            <LineBatchesSection
              key={`bd-${l.id}`}
              control={control}
              watch={watch}
              idx={idx}
              line={l}
              remaining={Number(remainingByLine[l.id] || 0)}
              attempted={attemptedSave}
            />
          ) : null
        )}
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
  attempted: boolean;
}) {
  const { control, watch, idx, line, remaining, attempted } = props;
  // Hook lives inside a dedicated component to keep parent's hook order stable
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${idx}.batches` as const,
  });

  // Focus management for new-row-on-Tab UX
  const pendingFocusRef = useRef<{ row: number; col: number } | null>(null);
  const focusCell = ({
    row,
    col,
  }: {
    row: number;
    col: number;
  }): HTMLElement | null => {
    return document.querySelector(
      `[data-batch-row="${row}"][data-batch-col="${col}"]`
    ) as HTMLElement | null;
  };
  useLayoutEffect(() => {
    if (pendingFocusRef.current) {
      const { row, col } = pendingFocusRef.current;
      pendingFocusRef.current = null;
      const el = focusCell({ row, col });
      el?.focus?.();
    }
  });

  const batches = (watch(`items.${idx}.batches` as const) as any[]) || [];
  const sum = Array.isArray(batches)
    ? batches.reduce((t: number, r: any) => t + (Number(r?.qty) || 0), 0)
    : 0;
  const total = Number((watch(`items.${idx}.total` as const) as any) || 0);
  const rem = Number(remaining || 0);
  const isRowEmpty = (r: any) => {
    if (!r) return true;
    const hasText = !!(
      (r.name && String(r.name).trim()) ||
      (r.codeMill && String(r.codeMill).trim()) ||
      (r.codeSartor && String(r.codeSartor).trim())
    );
    const hasQty = Number(r.qty || 0) > 0;
    return !hasText && !hasQty;
  };
  const anyNonEmpty = Array.isArray(batches)
    ? batches.some((r) => !isRowEmpty(r))
    : false;
  const needsBatches = total > 0 && !anyNonEmpty;
  const sumMismatch = Math.round(sum * 100) !== Math.round(total * 100);
  const ok = !needsBatches && !sumMismatch;

  // Auto-manage a trailing empty row: ensure at least one row exists and
  // ensure at least one row exists when total > 0
  useEffect(() => {
    if (total <= 0) return;
    // Ensure at least one row exists
    if (fields.length === 0) {
      append({ name: "", codeMill: "", codeSartor: "", qty: 0 });
      return;
    }
  }, [append, fields.length, total]);

  return (
    <Stack gap={6}>
      <Group justify="space-between" align="center">
        <Text>
          {line.sku || ""} · {line.name || ""}
        </Text>
        <Text fw={600} c={ok ? "dimmed" : "red"}>
          {sum} / {total}
        </Text>
      </Group>
      {attempted && !ok && (
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
          {/* Overages are allowed; no error for exceeding remaining */}
        </Stack>
      )}
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
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
                  name={`items.${idx}.batches.${bIdx}.codeMill` as const}
                  render={({ field }) => (
                    <TextInput
                      data-batch-row={bIdx}
                      data-batch-col={0}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e)}
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
                      data-batch-row={bIdx}
                      data-batch-col={1}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e)}
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
                      data-batch-row={bIdx}
                      data-batch-col={2}
                      value={field.value as any}
                      onChange={(v) => {
                        const nv = Number(v) || 0;
                        field.onChange(nv);
                      }}
                      onKeyDownCapture={(e) => {
                        if ((e as any).isComposing) return;
                        if (
                          e.key !== "Tab" ||
                          e.altKey ||
                          e.ctrlKey ||
                          e.metaKey
                        )
                          return;
                        // For now, respect Shift+Tab and don't create a row on reverse tab
                        if (e.shiftKey) return;
                        const isLastRow = bIdx === fields.length - 1;
                        const needsNewRow =
                          isLastRow &&
                          Math.round(sum * 100) < Math.round(total * 100);
                        console.log("!! tab", {
                          isLastRow,
                          sum,
                          total,
                          needsNewRow,
                        });
                        if (!needsNewRow) return;
                        e.preventDefault();
                        e.stopPropagation();
                        flushSync(() =>
                          append({
                            name: "",
                            codeMill: "",
                            codeSartor: "",
                            qty: 0,
                          })
                        );
                        const nextRow = bIdx + 1;
                        const nextCol = 0; // Focus Mill code in the new row
                        const el = focusCell({ row: nextRow, col: nextCol });
                        if (el && typeof (el as any).focus === "function") {
                          (el as any).focus();
                        } else {
                          pendingFocusRef.current = {
                            row: nextRow,
                            col: nextCol,
                          };
                        }
                      }}
                      onBlur={(e) => {
                        field.onBlur();
                        const raw = (e.currentTarget?.value ?? "").toString();
                        const currVal = Number(raw) || 0;
                        // On blur, if sum of batches is less than total, ensure a trailing empty row exists
                        const nextBatches = [...(batches || [])];
                        nextBatches[bIdx] = {
                          ...(nextBatches[bIdx] || {}),
                          qty: currVal,
                        } as any;
                        const nextSum = nextBatches.reduce(
                          (t: number, r: any) => t + (Number(r?.qty) || 0),
                          0
                        );
                        if (currVal > 0 && nextSum < total) {
                          const last = nextBatches[nextBatches.length - 1];
                          if (!last || !isRowEmpty(last)) {
                            append({
                              name: "",
                              codeMill: "",
                              codeSartor: "",
                              qty: 0,
                            });
                          }
                        }
                      }}
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
                  onClick={() => {
                    const removedQty = Number(batches?.[bIdx]?.qty || 0);
                    const nextSum = Math.max(0, (sum || 0) - removedQty);
                    remove(bIdx);
                    if (nextSum < total) {
                      const nextBatches = (batches || []).filter(
                        (_, i) => i !== bIdx
                      );
                      const last = nextBatches[nextBatches.length - 1];
                      if (!last || !isRowEmpty(last)) {
                        append({
                          name: "",
                          codeMill: "",
                          codeSartor: "",
                          qty: 0,
                        });
                      }
                    }
                  }}
                >
                  Remove
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
