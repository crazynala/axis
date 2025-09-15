import { useState } from "react";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useSubmit } from "@remix-run/react";

export type BatchOption = {
  value: string; // batch id as string
  label: string; // display
  locationId?: number | null;
};

export function InventoryTransferModal(props: {
  opened: boolean;
  onClose: () => void;
  productId: number;
  sourceBatchId: number;
  sourceLabel: string;
  sourceQty: number;
  sourceLocationId: number | null;
  // existing target batches for same product
  targetOptions: BatchOption[];
}) {
  const {
    opened,
    onClose,
    productId,
    sourceBatchId,
    sourceLabel,
    sourceQty,
    sourceLocationId,
    targetOptions,
  } = props;
  const submit = useSubmit();
  const [when, setWhen] = useState<Date | null>(new Date());
  const [qty, setQty] = useState<number | "">(sourceQty);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [targetBatch, setTargetBatch] = useState<string | null>(null);
  const [newName, setNewName] = useState<string>("");
  const [newCodes, setNewCodes] = useState<{ mill?: string; sartor?: string }>(
    {}
  );
  const [newLocationId, setNewLocationId] = useState<number | "" | null>(
    sourceLocationId
  );

  const validQty = Number(qty || 0);
  const remaining = Math.max(0, Math.round((sourceQty - validQty) * 100) / 100);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Transfer Inventory"
      size="md"
      centered
    >
      <Stack>
        <Group justify="space-between" align="center">
          <DatePickerInput
            value={when}
            onChange={(d) => setWhen((d as any) ?? null)}
            valueFormat="YYYY-MM-DD"
            required
          />
          <Button
            onClick={() => {
              const fd = new FormData();
              fd.set("_intent", "inventory.transfer.batch");
              fd.set("productId", String(productId));
              fd.set("sourceBatchId", String(sourceBatchId));
              fd.set("qty", String(validQty));
              if (when)
                fd.set("date", new Date(when).toISOString().slice(0, 10));
              if (mode === "existing") {
                fd.set("mode", "existing");
                if (targetBatch) fd.set("targetBatchId", targetBatch);
              } else {
                fd.set("mode", "new");
                fd.set("targetName", newName || "");
                fd.set("targetCodeMill", newCodes.mill || "");
                fd.set("targetCodeSartor", newCodes.sartor || "");
                fd.set("targetLocationId", String(newLocationId ?? ""));
              }
              submit(fd, { method: "post" });
              onClose();
            }}
            disabled={
              !when ||
              validQty <= 0 ||
              validQty > sourceQty ||
              (mode === "existing" && !targetBatch)
            }
          >
            Save
          </Button>
        </Group>
        <Table withTableBorder withColumnBorders>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>From</Table.Td>
              <Table.Td>{sourceLabel}</Table.Td>
              <Table.Td>Qty</Table.Td>
              <Table.Td>
                <NumberInput
                  value={qty as any}
                  onChange={(v) => setQty(Number(v) || 0)}
                  hideControls
                  w={100}
                  min={0}
                  max={sourceQty}
                />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>To</Table.Td>
              <Table.Td colSpan={3}>
                <Group gap={8} align="center">
                  <Select
                    data={[
                      { value: "existing", label: "Existing Batch" },
                      { value: "new", label: "New Batch" },
                    ]}
                    value={mode}
                    onChange={(v) => setMode((v as any) ?? "existing")}
                    w={180}
                  />
                  {mode === "existing" ? (
                    <Select
                      data={targetOptions}
                      value={targetBatch}
                      onChange={setTargetBatch}
                      searchable
                      clearable
                      placeholder="Select batch"
                      w={280}
                    />
                  ) : (
                    <Group gap={6} align="center" wrap="wrap">
                      <Text size="sm">Name</Text>
                      <TextInput
                        value={newName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewName(e.currentTarget.value)
                        }
                        w={140}
                      />
                      <Text size="sm">Mill</Text>
                      <TextInput
                        value={newCodes.mill || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewCodes((p) => ({
                            ...p,
                            mill: e.currentTarget.value,
                          }))
                        }
                        w={100}
                      />
                      <Text size="sm">Sartor</Text>
                      <TextInput
                        value={newCodes.sartor || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewCodes((p) => ({
                            ...p,
                            sartor: e.currentTarget.value,
                          }))
                        }
                        w={100}
                      />
                      <Text size="sm">Location ID</Text>
                      <NumberInput
                        value={newLocationId as any}
                        onChange={(v) =>
                          setNewLocationId((Number(v) as any) ?? null)
                        }
                        hideControls
                        w={100}
                      />
                    </Group>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td></Table.Td>
              <Table.Td colSpan={3}>
                <Text size="sm" c="dimmed">
                  Transfer will create a movement header of type "transfer" with
                  out from source batch location and in to the target.
                </Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Remaining in source</Table.Td>
              <Table.Td colSpan={3}>{remaining}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Stack>
    </Modal>
  );
}
