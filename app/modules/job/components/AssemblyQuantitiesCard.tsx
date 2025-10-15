import { Card, Divider, Group, Table, Title } from "@mantine/core";

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
}: {
  title?: string;
  variants: VariantInfo;
  items: SingleQuantities[];
}) {
  console.log("Rendering AssemblyQuantitiesCard with items:", items);
  const fmt = (n: number | undefined) =>
    n === undefined || n === null || !Number.isFinite(n) || n === 0 ? "" : n;
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
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Title order={4}>{title}</Title>
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
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                {cols.map((l: string, i: number) => (
                  <Table.Th key={`qcol-${idx}-${i}`}>
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
                  <Table.Td key={`ord-${idx}-${i}`}>
                    {fmt(it.ordered[i])}
                  </Table.Td>
                ))}
                <Table.Td>{fmt(sum(it.ordered))}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Cut</Table.Td>
                {cols.map((_l, i) => (
                  <Table.Td key={`cut-${idx}-${i}`}>{fmt(it.cut[i])}</Table.Td>
                ))}
                <Table.Td>{fmt(it.totals.cut)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Make</Table.Td>
                {cols.map((_l, i) => (
                  <Table.Td key={`make-${idx}-${i}`}>
                    {fmt(it.make[i])}
                  </Table.Td>
                ))}
                <Table.Td>{fmt(it.totals.make)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Pack</Table.Td>
                {cols.map((_l, i) => (
                  <Table.Td key={`pack-${idx}-${i}`}>
                    {fmt(it.pack[i])}
                  </Table.Td>
                ))}
                <Table.Td>{fmt(it.totals.pack)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
      ))}
    </Card>
  );
}
