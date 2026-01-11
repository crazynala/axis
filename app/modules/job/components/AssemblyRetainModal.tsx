import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Stack, Table, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import type { QuantityItem } from "~/modules/job/components/AssembliesEditor";
import { useFetcher } from "@remix-run/react";
import { showToastError, showToastSuccess } from "~/utils/toast";

const sumArray = (arr: number[]) =>
  arr.reduce((total, value) => total + (Number(value) || 0), 0);

type AssemblyRetainModalProps = {
  opened: boolean;
  onClose: () => void;
  assembly: any;
  variantLabels: string[];
  quantityItem?: QuantityItem;
  destinationLabel: string;
};

export function AssemblyRetainModal({
  opened,
  onClose,
  assembly,
  variantLabels,
  quantityItem,
  destinationLabel,
}: AssemblyRetainModalProps) {
  const fetcher = useFetcher<{ error?: string }>();
  const [activityDate, setActivityDate] = useState<Date | null>(new Date());
  const [notes, setNotes] = useState("");
  const lastToastKeyRef = useRef<string | null>(null);

  const finishBreakdown = useMemo(() => {
    const finish =
      (quantityItem as any)?.stageStats?.finish?.usableArr ||
      quantityItem?.finish ||
      [];
    const len = Math.max(variantLabels.length, finish.length, 1);
    return Array.from({ length: len }, (_, idx) => Number(finish[idx] ?? 0) || 0);
  }, [variantLabels.length, quantityItem]);

  const retainedBreakdown = useMemo(() => {
    const retained =
      (quantityItem as any)?.stageStats?.retain?.usableArr ||
      quantityItem?.retain ||
      [];
    const len = Math.max(variantLabels.length, retained.length, 1);
    return Array.from({ length: len }, (_, idx) => Number(retained[idx] ?? 0) || 0);
  }, [variantLabels.length, quantityItem]);

  const availableBreakdown = useMemo(() => {
    const len = Math.max(
      variantLabels.length,
      finishBreakdown.length,
      retainedBreakdown.length
    );
    return Array.from({ length: len }, (_, idx) => {
      const completed = Number(finishBreakdown[idx] || 0);
      const already = Number(retainedBreakdown[idx] || 0);
      return Math.max(0, completed - already);
    });
  }, [variantLabels.length, finishBreakdown, retainedBreakdown]);

  const [retainBreakdown, setRetainBreakdown] = useState<number[]>(
    availableBreakdown
  );

  const totalAvailable = sumArray(availableBreakdown);
  const totalRetain = sumArray(retainBreakdown);

  useEffect(() => {
    if (!opened) return;
    setRetainBreakdown(availableBreakdown);
    lastToastKeyRef.current = null;
  }, [opened, availableBreakdown]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (!fetcher.data) return;
    const error = (fetcher.data as any).error;
    if (error) {
      const key = `error:${error}`;
      if (lastToastKeyRef.current !== key) {
        showToastError(error);
        lastToastKeyRef.current = key;
      }
      return;
    }
    const successKey = "success:retained";
    if (lastToastKeyRef.current !== successKey) {
      showToastSuccess("Retained");
      lastToastKeyRef.current = successKey;
    }
    onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  const submitRetain = () => {
    const fd = new FormData();
    fd.set("_intent", "activity.create.retain");
    fd.set("assemblyId", String(assembly?.id ?? ""));
    fd.set("qtyBreakdown", JSON.stringify(retainBreakdown));
    if (activityDate) fd.set("activityDate", activityDate.toISOString());
    if (notes.trim()) fd.set("notes", notes.trim());
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      closeOnClickOutside={false}
      title={
        <Stack gap={2} style={{ overflow: "hidden", minWidth: 0 }}>
          <Text fw={600}>Retain</Text>
          <Text size="xs" c="dimmed">
            Destination: {destinationLabel}
          </Text>
        </Stack>
      }
    >
      <Stack gap="sm">
        {fetcher.data?.error ? (
          <Alert color="red">{fetcher.data.error}</Alert>
        ) : null}
        <Group justify="space-between">
          <DatePickerInput
            label="Date"
            value={activityDate}
            onChange={setActivityDate}
          />
          <Text size="sm" c="dimmed">
            Available: {totalAvailable}
          </Text>
        </Group>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Size breakdown
          </Text>
          <Table withColumnBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {availableBreakdown.map((_val, idx) => (
                  <Table.Th ta="center" key={`retain-head-${idx}`}>
                    {variantLabels[idx] || `Variant ${idx + 1}`}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                {availableBreakdown.map((cap, idx) => {
                  const current = Number(retainBreakdown[idx] ?? 0) || 0;
                  const displayVal = current ? String(current) : "";
                  const disabled = cap <= 0;
                  return (
                    <Table.Td p={0} ta="center" key={`retain-cell-${idx}`}>
                      <TextInput
                        type="number"
                        variant="unstyled"
                        inputMode="numeric"
                        disabled={disabled}
                        value={displayVal}
                        onChange={(e) => {
                          if (disabled) return;
                          const rawVal = Number(e.currentTarget.value);
                          const val = Number.isFinite(rawVal)
                            ? Math.max(0, Math.min(rawVal, cap))
                            : 0;
                          setRetainBreakdown((prev) => {
                            const next = [...prev];
                            next[idx] = val;
                            return next;
                          });
                        }}
                        styles={{
                          input: {
                            textAlign: "center",
                            padding: "8px 4px",
                            opacity: disabled ? 0.5 : 1,
                            cursor: disabled ? "not-allowed" : "text",
                          },
                        }}
                      />
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Stack>
        <TextInput
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Retaining {totalRetain} / {totalAvailable}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={submitRetain}
              disabled={totalRetain <= 0 || totalRetain > totalAvailable}
            >
              Retain
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
