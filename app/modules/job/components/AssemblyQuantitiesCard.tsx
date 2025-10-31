import {
  Button,
  Card,
  Divider,
  Group,
  Table,
  Title,
  TextInput,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

export type VariantInfo = {
  labels: string[];
  numVariants: number;
};

type SingleQuantities = {
  label: string;
  ordered: number[];
  cut: number[];
  make: number[];
  pack: number[];
  totals: { cut: number; make: number; pack: number };
};

export function AssemblyQuantitiesCard({
  title = "Quantities",
  variants,
  items,
  editableOrdered = false,
  onSubmitOrdered,
  onCancelOrdered,
  orderedValue,
  onChangeOrdered,
  hideInlineActions,
}: {
  title?: string;
  variants: VariantInfo;
  items: SingleQuantities[];
  /** Enable inline editing for the Ordered row (first item only is supported) */
  editableOrdered?: boolean;
  onSubmitOrdered?: (ordered: number[]) => void;
  onCancelOrdered?: () => void;
  /** Controlled ordered array; when provided, component becomes controlled */
  orderedValue?: number[];
  /** Change handler for controlled mode */
  onChangeOrdered?: (ordered: number[]) => void;
  /** Hide inline Save/Cancel buttons (use global form header instead) */
  hideInlineActions?: boolean;
}) {
  const fmt = (n: number | undefined) =>
    n === undefined || n === null || !Number.isFinite(n) || n === 0 ? "∙" : n;
  const rawLabels = variants.labels;
  // Determine if labels include any non-empty values and where the last non-empty is
  const lastNonEmpty = (() => {
    let last = -1;
    for (let i = rawLabels.length - 1; i >= 0; i--) {
      const s = (rawLabels[i] || "").toString().trim();
      if (s) {
        last = i;
        break;
      }
    }
    return last;
  })();
  // Fallback to the longest data array length when labels and numVariants are not specified
  const dataMaxLen = (items || []).reduce((m, it) => {
    const l0 = Array.isArray(it?.ordered) ? it.ordered.length : 0;
    const l1 = Array.isArray(it?.cut) ? it.cut.length : 0;
    const l2 = Array.isArray(it?.make) ? it.make.length : 0;
    const l3 = Array.isArray(it?.pack) ? it.pack.length : 0;
    return Math.max(m, l0, l1, l2, l3);
  }, 0);
  // Prefer explicit numVariants when provided; else use labels length or data length fallback
  const baseLen =
    variants.numVariants > 0
      ? variants.numVariants
      : Math.max(rawLabels.length, dataMaxLen);
  // If we have at least one non-empty label, cap by the last non-empty index; otherwise keep baseLen
  const effectiveLen = Math.max(
    0,
    lastNonEmpty >= 0 ? Math.min(baseLen, lastNonEmpty + 1) : baseLen
  );
  const labelSlice = rawLabels.slice(0, effectiveLen);
  const cols = (
    labelSlice.some((s) => (s || "").toString().trim())
      ? labelSlice
      : Array.from({ length: effectiveLen }, (_, i) => `${i + 1}`)
  ) as string[];
  const sum = (arr: number[]) =>
    (arr || []).reduce(
      (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
      0
    );

  // Inline edit state (only for first item). Keep local state so total updates live.
  const isControlled = Array.isArray(orderedValue);
  const [orderedDraft, setOrderedDraft] = useState<number[] | null>(
    editableOrdered && !isControlled && items[0]?.ordered
      ? [...items[0].ordered]
      : null
  );
  useEffect(() => {
    if (isControlled) return; // parent controls state
    if (editableOrdered)
      setOrderedDraft(items[0]?.ordered ? [...items[0].ordered] : []);
    else setOrderedDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableOrdered, items && items[0] && items[0].ordered?.join(",")]);

  const handleChangeCell = (idx: number, value: string) => {
    const v = value === "" ? 0 : Number(value);
    const updater = (srcArr: number[]) => {
      const next = [...srcArr];
      next[idx] = Number.isFinite(v) ? (v as number) | 0 : 0;
      return next;
    };
    if (isControlled && Array.isArray(orderedValue)) {
      const next = updater(orderedValue);
      onChangeOrdered?.(next);
    } else if (Array.isArray(orderedDraft)) {
      setOrderedDraft((prev) => updater(Array.isArray(prev) ? prev : []));
    }
  };

  const effectiveOrdered =
    editableOrdered &&
    (isControlled ? Array.isArray(orderedValue) : Array.isArray(orderedDraft))
      ? isControlled
        ? (orderedValue as number[])
        : (orderedDraft as number[])
      : items[0]?.ordered || [];

  const totalOrdered = useMemo(() => sum(effectiveOrdered), [effectiveOrdered]);

  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>{title}</Title>
          {editableOrdered && !hideInlineActions ? (
            <Group gap="xs">
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  if (isControlled) onCancelOrdered?.();
                  else
                    setOrderedDraft(
                      items[0]?.ordered ? [...items[0].ordered] : []
                    );
                  onCancelOrdered?.();
                }}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  if (isControlled && Array.isArray(orderedValue))
                    onSubmitOrdered?.(orderedValue);
                  else if (Array.isArray(orderedDraft))
                    onSubmitOrdered?.(orderedDraft);
                }}
              >
                Save
              </Button>
            </Group>
          ) : null}
        </Group>
      </Card.Section>
      <Divider my="xs" />
      {items.map((it, idx) => (
        <div
          key={`q-${idx}`}
          style={{ marginBottom: idx < items.length - 1 ? 16 : 0 }}
        >
          {items.length > 1 && (
            <Group justify="space-between" mb="xs">
              <Title order={6}>{it.label}</Title>
            </Group>
          )}
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                {cols.map((l: string, i: number) => (
                  <Table.Th
                    key={`qcol-${idx}-${i}`}
                    style={{ textAlign: "center" }}
                  >
                    {l || `${i + 1}`}
                  </Table.Th>
                ))}
                <Table.Th>Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>Ordered</Table.Td>
                {cols.map((_l, i) => (
                  <Table.Td
                    key={`ord-${idx}-${i}`}
                    style={{ padding: editableOrdered ? 0 : undefined }}
                  >
                    {editableOrdered && idx === 0 ? (
                      <TextInput
                        type="number"
                        value={effectiveOrdered[i] ?? 0}
                        onChange={(e) =>
                          handleChangeCell(i, e.currentTarget.value)
                        }
                        variant="unstyled"
                        styles={{
                          input: {
                            width: "100%",
                            textAlign: "center",
                            padding: 8,
                          },
                        }}
                      />
                    ) : (
                      fmt(it.ordered[i])
                    )}
                  </Table.Td>
                ))}
                <Table.Td align="center" style={{ verticalAlign: "baseline" }}>
                  {editableOrdered && idx === 0
                    ? fmt(totalOrdered)
                    : fmt(sum(it.ordered))}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Cut</Table.Td>
                {cols.map((_l, i) => (
                  <Table.Td key={`cut-${idx}-${i}`} align="center">
                    {fmt(it.cut[i])}
                  </Table.Td>
                ))}
                <Table.Td align="center" style={{ verticalAlign: "baseline" }}>
                  {fmt(it.totals.cut)}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Make</Table.Td>
                {cols.map((_l, i) => (
                  <Table.Td key={`make-${idx}-${i}`} align="center">
                    {fmt(it.make[i])}
                  </Table.Td>
                ))}
                <Table.Td align="center" style={{ verticalAlign: "baseline" }}>
                  {fmt(it.totals.make)}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Pack</Table.Td>
                {cols.map((_l, i) => (
                  <Table.Td key={`pack-${idx}-${i}`} align="center">
                    {fmt(it.pack[i])}
                  </Table.Td>
                ))}
                <Table.Td align="center" style={{ verticalAlign: "baseline" }}>
                  {fmt(it.totals.pack)}
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
      ))}
    </Card>
  );
}
