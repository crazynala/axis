import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";

export type ShipmentBoxLine = {
  id: number;
  productId: number | null;
  quantity: number | string | null;
  qtyBreakdown: number[] | null;
  jobId: number | null;
  job?: { id: number; name: string | null } | null;
  packingOnly?: boolean | null;
  isAdHoc?: boolean | null;
  description?: string | null;
};

export type ShipmentBox = {
  id: number;
  code: string | null;
  warehouseNumber: number | null;
  companyId: number | null;
  company?: { id: number; name: string | null } | null;
  state: string | null;
  lines: ShipmentBoxLine[];
};

export type AttachBoxesModalProps = {
  opened: boolean;
  onClose: () => void;
  shipmentId: number;
  shipmentCustomerId?: number | null;
  boxes: ShipmentBox[];
  onConfirm: (boxIds: number[]) => void;
};

function sumQuantity(line: ShipmentBoxLine): number {
  if (line.packingOnly) return 0;
  const qty = Number(line.quantity ?? 0);
  if (Number.isFinite(qty) && qty !== 0) return qty;
  const breakdown = Array.isArray(line.qtyBreakdown) ? line.qtyBreakdown : [];
  return breakdown.reduce((total, value) => total + (Number(value) || 0), 0);
}

function mergeLabels(items: Array<string | null | undefined>): string {
  const labels = Array.from(
    new Set(
      items.map((value) => (value ?? "").toString().trim()).filter(Boolean)
    )
  );
  if (!labels.length) return "—";
  if (labels.length === 1) return labels[0]!;
  return `${labels[0]} +${labels.length - 1}`;
}

export function AttachBoxesModal({
  opened,
  onClose,
  shipmentId,
  shipmentCustomerId,
  boxes,
  onConfirm,
}: AttachBoxesModalProps) {
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!opened) return;
    setSelected(new Set());
    setCustomerFilter(
      shipmentCustomerId != null ? String(shipmentCustomerId) : null
    );
    setJobFilter(null);
  }, [opened, shipmentCustomerId]);

  const customerOptions = useMemo(() => {
    const set = new Map<string, string>();
    boxes.forEach((box) => {
      if (box.companyId == null) return;
      const key = String(box.companyId);
      if (!set.has(key)) {
        set.set(key, box.company?.name || `Company ${box.companyId}`);
      }
    });
    return Array.from(set.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [boxes]);

  const jobOptions = useMemo(() => {
    const set = new Map<string, string>();
    boxes.forEach((box) => {
      box.lines.forEach((line) => {
        if (line.packingOnly) return;
        if (line.jobId == null) return;
        const key = String(line.jobId);
        if (!set.has(key)) {
          set.set(key, line.job?.name || `Job ${line.jobId}`);
        }
      });
    });
    return Array.from(set.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [boxes]);

  const filteredBoxes = boxes.filter((box) => {
    if (customerFilter && String(box.companyId ?? "") !== customerFilter) {
      return false;
    }
    if (jobFilter) {
      const hasJob = box.lines.some(
        (line) =>
          !line.packingOnly &&
          line.jobId != null &&
          String(line.jobId) === jobFilter
      );
      if (!hasJob) return false;
    }
    return true;
  });

  const rows = filteredBoxes.map((box) => {
    const commercialLines = box.lines.filter((line) => !line.packingOnly);
    const totalQuantity = commercialLines.reduce(
      (sum, line) => sum + sumQuantity(line),
      0
    );
    const skuCount = Array.from(
      new Set(
        commercialLines
          .map((line) => line.productId ?? null)
          .filter((id): id is number => id != null)
      )
    ).length;
    const jobLabel = mergeLabels(
      commercialLines.map(
        (line) =>
          line.job?.name || (line.jobId != null ? `Job ${line.jobId}` : null)
      )
    );
    return {
      box,
      totalQuantity,
      skuCount,
      jobLabel,
    };
  });

  const toggleBox = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!selected.size) return;
    onConfirm(Array.from(selected));
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Attach boxes from warehouse"
      size="xl"
      centered
    >
      <Stack gap="md">
        <Group grow>
          <Select
            label="Customer"
            placeholder="Any customer"
            data={customerOptions}
            value={customerFilter}
            onChange={setCustomerFilter}
            clearable
          />
          <Select
            label="Job"
            placeholder="Any job"
            data={jobOptions}
            value={jobFilter}
            onChange={setJobFilter}
            clearable
          />
        </Group>
        <ScrollArea h={360} offsetScrollbars>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th width={32}></Table.Th>
                <Table.Th>Warehouse Box #</Table.Th>
                <Table.Th>Job</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th ta="right">Total Qty</Table.Th>
                <Table.Th ta="right"># SKUs</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed">No boxes match the current filters.</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                rows.map(({ box, totalQuantity, skuCount, jobLabel }) => (
                  <Table.Tr key={box.id}>
                    <Table.Td>
                      <Checkbox
                        checked={selected.has(box.id)}
                        onChange={() => toggleBox(box.id)}
                        aria-label={`Select box ${box.id}`}
                      />
                    </Table.Td>
                    <Table.Td>
                      {box.warehouseNumber != null
                        ? `#${box.warehouseNumber}`
                        : box.code || `Box ${box.id}`}
                    </Table.Td>
                    <Table.Td>{jobLabel}</Table.Td>
                    <Table.Td>
                      {box.company?.name ||
                        (box.companyId != null
                          ? `Company ${box.companyId}`
                          : "—")}
                    </Table.Td>
                    <Table.Td ta="right">{totalQuantity}</Table.Td>
                    <Table.Td ta="right">{skuCount}</Table.Td>
                    <Table.Td>
                      <Badge
                        color={
                          box.state === "sealed"
                            ? "green"
                            : box.state === "open"
                            ? "blue"
                            : "gray"
                        }
                      >
                        {box.state || "unknown"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {selected.size} box{selected.size === 1 ? "" : "es"} selected
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!selected.size}>
              Attach boxes
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
