import { useMemo, useState } from "react";
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
  const [when, setWhen] = useState<Date | null>(date ?? new Date());

  // Batch mode state
  const [newQty, setNewQty] = useState<number | "">(() =>
    batch ? batch.qty : 0
  );

  // Product mode state
  const [rows, setRows] = useState<BulkRow[]>(() =>
    (batches || []).map((b) => ({ ...b, target: b.qty }))
  );
  const [newRows, setNewRows] = useState<
    Array<{
      name?: string;
      codeMill?: string;
      codeSartor?: string;
      locationId: number | null;
      qty: number;
    }>
  >([]);
  const [scope, setScope] = useState<"all" | "nonzero">("nonzero");

  const delta = useMemo(() => {
    if (mode !== "batch" || !batch) return 0;
    const nv = Number(newQty || 0);
    return Math.round((nv - (batch?.qty || 0)) * 100) / 100;
  }, [mode, batch, newQty]);

  const filteredRows = useMemo(() => {
    if (mode !== "product") return [] as BulkRow[];
    const base = rows;
    return scope === "nonzero"
      ? base.filter((r) => Math.round((r.target - r.qty) * 100) / 100 !== 0)
      : base;
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
            <DatePickerInput
              label="Date"
              value={when}
              onChange={(d) => setWhen((d as any) ?? null)}
              valueFormat="YYYY-MM-DD"
              required
            />
            <Button
              onClick={() => {
                const fd = new FormData();
                fd.set("_intent", "inventory.amend.batch");
                fd.set("productId", String(productId));
                fd.set("batchId", String(batch.batchId));
                fd.set("locationId", String(batch.locationId ?? ""));
                if (when)
                  fd.set("date", new Date(when).toISOString().slice(0, 10));
                fd.set("delta", String(delta));
                submit(fd, { method: "post" });
                onClose();
              }}
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
                  <NumberInput
                    value={newQty as any}
                    onChange={(v) => setNewQty(Number(v) || 0)}
                    hideControls
                    w={100}
                  />
                </Table.Td>
                <Table.Td>{delta}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
          <Text c="dimmed" size="sm">
            This will create an inventory adjustment movement (
            {delta >= 0 ? "adjust_in" : "adjust_out"}).
          </Text>
        </Stack>
      )}

      {mode === "product" && (
        <Stack>
          <Group justify="space-between" align="center">
            <DatePickerInput
              label="Date"
              value={when}
              onChange={(d) => setWhen((d as any) ?? null)}
              valueFormat="YYYY-MM-DD"
              required
            />
            <Group gap={8} align="center">
              <SegmentedControl
                data={[
                  { label: "All", value: "all" },
                  { label: "Changed", value: "nonzero" },
                ]}
                size="xs"
                value={scope}
                onChange={(v) => setScope(v as any)}
              />
              <Button
                onClick={() => {
                  const changes = filteredRows.map((r) => ({
                    batchId: r.batchId,
                    locationId: r.locationId,
                    delta: Math.round((r.target - r.qty) * 100) / 100,
                  }));
                  const creates = newRows
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
                  if (when)
                    fd.set("date", new Date(when).toISOString().slice(0, 10));
                  fd.set("changes", JSON.stringify(changes));
                  fd.set("creates", JSON.stringify(creates));
                  submit(fd, { method: "post" });
                  onClose();
                }}
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
              {filteredRows.map((r, idx) => (
                <Table.Tr key={r.batchId}>
                  <Table.Td>
                    {r.name || r.codeMill || r.codeSartor || r.batchId}
                  </Table.Td>
                  <Table.Td>{r.locationName || r.locationId || ""}</Table.Td>
                  <Table.Td>{r.qty}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      value={r.target as any}
                      onChange={(v) => {
                        const nv = Number(v) || 0;
                        setRows((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, target: nv } : x
                          )
                        );
                      }}
                      hideControls
                      w={100}
                    />
                  </Table.Td>
                  <Table.Td>
                    {Math.round((r.target - r.qty) * 100) / 100}
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
                    <TextInput
                      value={r.name || ""}
                      onChange={(e) =>
                        setNewRows((p) =>
                          p.map((x, i) =>
                            i === idx
                              ? { ...x, name: e.currentTarget.value }
                              : x
                          )
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={r.codeMill || ""}
                      onChange={(e) =>
                        setNewRows((p) =>
                          p.map((x, i) =>
                            i === idx
                              ? { ...x, codeMill: e.currentTarget.value }
                              : x
                          )
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={r.codeSartor || ""}
                      onChange={(e) =>
                        setNewRows((p) =>
                          p.map((x, i) =>
                            i === idx
                              ? { ...x, codeSartor: e.currentTarget.value }
                              : x
                          )
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      value={r.locationId as any}
                      onChange={(v) =>
                        setNewRows((p) =>
                          p.map((x, i) =>
                            i === idx
                              ? { ...x, locationId: (Number(v) as any) ?? null }
                              : x
                          )
                        )
                      }
                      hideControls
                      w={100}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      value={r.qty as any}
                      onChange={(v) =>
                        setNewRows((p) =>
                          p.map((x, i) =>
                            i === idx ? { ...x, qty: Number(v) || 0 } : x
                          )
                        )
                      }
                      hideControls
                      w={100}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button
                      variant="light"
                      color="red"
                      size="xs"
                      onClick={() =>
                        setNewRows((p) => p.filter((_x, i) => i !== idx))
                      }
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
                      setNewRows((p) => [
                        ...p,
                        {
                          name: "",
                          codeMill: "",
                          codeSartor: "",
                          locationId: null,
                          qty: 0,
                        },
                      ])
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
