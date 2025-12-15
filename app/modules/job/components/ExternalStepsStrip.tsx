import {
  Accordion,
  Badge,
  Card,
  Divider,
  Group,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import type { ReactNode } from "react";
import type {
  DerivedExternalStep,
  ExternalLeadTimeSource,
  ExternalStepStatus,
} from "~/modules/job/types/externalSteps";

type Props = {
  steps?: DerivedExternalStep[] | null;
};

const STATUS_LABELS: Record<ExternalStepStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "Sent out",
  DONE: "Received",
  IMPLICIT_DONE: "Implicit done",
};

const STATUS_COLORS: Record<ExternalStepStatus, string> = {
  NOT_STARTED: "gray",
  IN_PROGRESS: "blue",
  DONE: "green",
  IMPLICIT_DONE: "teal",
};

const LEAD_TIME_SOURCE_LABELS: Record<
  ExternalLeadTimeSource,
  string
> = {
  COSTING: "Costing",
  PRODUCT: "Product",
  COMPANY: "Vendor default",
};

export function ExternalStepsStrip({ steps }: Props) {
  const rows = steps ?? [];
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text fw={600} size="sm">
              External steps
            </Text>
            <Text size="xs" c="dimmed">
              Tracks vendor work, ETAs, and return status per step.
            </Text>
          </Stack>
        </Group>
        {rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            No external steps expected for this assembly.
          </Text>
        ) : (
          <Accordion chevronPosition="left" variant="separated">
            {rows.map((step) => (
              <Accordion.Item key={step.type} value={step.type}>
                <Accordion.Control>
                  <Group
                    justify="space-between"
                    align="flex-start"
                    wrap="nowrap"
                  >
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Text fw={600}>{step.label}</Text>
                      <Text size="xs" c="dimmed">
                        {step.vendor?.name
                          ? `Vendor: ${step.vendor.name}`
                          : "Vendor pending"}
                      </Text>
                    </Stack>
                    <Group gap="xs" wrap="wrap" justify="flex-end">
                      {step.etaDate ? (
                        <Badge
                          variant="light"
                          color={step.isLate ? "red" : "gray"}
                        >
                          ETA {formatDate(step.etaDate)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" color="gray">
                          No ETA
                        </Badge>
                      )}
                      {step.lowConfidence ? (
                        <Badge variant="light" color="yellow">
                          Low confidence
                        </Badge>
                      ) : null}
                      {step.expected && !step.leadTimeDays ? (
                        <Badge variant="light" color="orange">
                          Lead time missing
                        </Badge>
                      ) : null}
                      {step.isLate ? (
                        <Badge variant="light" color="red">
                          Late
                        </Badge>
                      ) : null}
                      {!step.expected ? (
                        <Badge variant="outline" color="violet">
                          Ad hoc
                        </Badge>
                      ) : null}
                      <Badge
                        variant="filled"
                        color={STATUS_COLORS[step.status]}
                      >
                        {STATUS_LABELS[step.status]}
                      </Badge>
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm">
                    <Group align="flex-start" justify="flex-start" gap="xl" wrap="wrap">
                      <Detail label="Sent out" value={formatDate(step.sentDate)} />
                      <Detail label="Received" value={formatDate(step.receivedDate)} />
                      <Detail label="Qty out" value={formatQuantity(step.qtyOut)} />
                      <Detail label="Qty in" value={formatQuantity(step.qtyIn)} />
                      <Detail label="Defects logged" value={formatQuantity(step.defectQty)} />
                      <Detail label="Inference window" value={formatWindow(step)} />
                      <Detail label="Lead time" value={formatLeadTime(step)} />
                      <Detail
                        label="Lead time source"
                        value={
                          step.leadTimeSource
                            ? LEAD_TIME_SOURCE_LABELS[step.leadTimeSource]
                            : "—"
                        }
                      />
                    </Group>
                    {step.activities?.length ? (
                      <>
                        <Divider />
                        <Text size="sm" fw={500}>
                          Activity history
                        </Text>
                        <Table striped withTableBorder>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Date</Table.Th>
                              <Table.Th>Action</Table.Th>
                              <Table.Th>Qty</Table.Th>
                              <Table.Th>Kind</Table.Th>
                              <Table.Th>Vendor</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {step.activities.map((act) => (
                              <Table.Tr key={act.id}>
                                <Table.Td>{formatDate(act.activityDate)}</Table.Td>
                                <Table.Td>{act.action ?? "—"}</Table.Td>
                                <Table.Td>{formatQuantity(act.quantity)}</Table.Td>
                                <Table.Td>{act.kind ?? "—"}</Table.Td>
                                <Table.Td>
                                  {act.vendor?.name
                                    ? act.vendor.name
                                    : act.vendor?.id
                                    ? `Vendor ${act.vendor.id}`
                                    : "—"}
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </>
                    ) : null}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Stack>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <Stack gap={2} style={{ minWidth: 140 }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value ?? "—"}</Text>
    </Stack>
  );
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatQuantity(value: number | null | undefined) {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

function formatWindow(step: DerivedExternalStep) {
  if (!step.inferredStartDate && !step.inferredEndDate) return "—";
  const start = step.inferredStartDate ? formatDate(step.inferredStartDate) : "—";
  const end = step.inferredEndDate ? formatDate(step.inferredEndDate) : "—";
  return `${start} → ${end}`;
}

function formatLeadTime(step: DerivedExternalStep) {
  if (step.etaDate && step.leadTimeDays) {
    return `${step.leadTimeDays} day${step.leadTimeDays === 1 ? "" : "s"} (ETA ${formatDate(step.etaDate)})`;
  }
  if (step.leadTimeDays) {
    return `${step.leadTimeDays} day${step.leadTimeDays === 1 ? "" : "s"}`;
  }
  return "—";
}
