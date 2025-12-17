import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Drawer,
  Group,
  Stack,
  Tabs,
  Table,
  Text,
  Code,
  ScrollArea,
} from "@mantine/core";
import type { DebugExplainPayload } from "~/modules/debug/types";

const TAB_STORAGE_KEY = "debugDrawerTab";

type DebugDrawerProps = {
  opened: boolean;
  onClose: () => void;
  title: string;
  payload?: DebugExplainPayload | null;
  loading?: boolean;
};

export function DebugDrawer({
  opened,
  onClose,
  title,
  payload,
  loading,
}: DebugDrawerProps) {
  const [tab, setTab] = useState<string>("summary");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (stored) setTab(stored);
  }, []);

  const handleTabChange = (value: string | null) => {
    const next = value || "summary";
    setTab(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TAB_STORAGE_KEY, next);
    }
  };

  const jsonText = useMemo(() => {
    if (!payload) return "";
    return JSON.stringify(payload, null, 2);
  }, [payload]);

  const summaryText = useMemo(() => {
    if (!payload?.reasoning?.length) return "No reasoning entries.";
    return payload.reasoning
      .map((entry) => `• ${entry.label}: ${entry.why}`)
      .join("\n");
  }, [payload]);

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.style.position = "fixed";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title={title} position="right" size="lg">
      <Stack gap="sm">
        <Group justify="flex-end" gap="xs">
          <Button
            size="xs"
            variant="light"
            onClick={() => handleCopy(summaryText)}
            disabled={!payload}
          >
            Copy summary
          </Button>
          <Button
            size="xs"
            variant="light"
            onClick={() => handleCopy(jsonText)}
            disabled={!payload}
          >
            Copy JSON
          </Button>
        </Group>
        {loading ? (
          <Text size="sm" c="dimmed">
            Loading debug payload…
          </Text>
        ) : !payload ? (
          <Text size="sm" c="dimmed">
            No debug payload loaded.
          </Text>
        ) : (
          <Tabs value={tab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="summary">Summary</Tabs.Tab>
              <Tabs.Tab value="numbers">Numbers</Tabs.Tab>
              <Tabs.Tab value="json">JSON</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="summary" pt="sm">
              <Stack gap="xs">
                {payload.reasoning?.length ? (
                  payload.reasoning.map((entry) => (
                    <Stack key={entry.code} gap={2}>
                      <Text fw={600}>{entry.label}</Text>
                      <Text size="sm">{entry.why}</Text>
                      {entry.evidence ? (
                        <DebugKeyValueTable
                          data={entry.evidence}
                          title="Evidence"
                        />
                      ) : null}
                    </Stack>
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    No reasoning entries.
                  </Text>
                )}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="numbers" pt="sm">
              <Stack gap="sm">
                {payload.rollups ? (
                  <DebugKeyValueTable data={payload.rollups} title="Rollups" />
                ) : null}
                {payload.inputs ? (
                  <DebugKeyValueTable data={payload.inputs} title="Inputs" />
                ) : null}
                {payload.derived ? (
                  <DebugKeyValueTable data={payload.derived} title="Derived" />
                ) : null}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="json" pt="sm">
              <ScrollArea h={400}>
                <Code block>{jsonText}</Code>
              </ScrollArea>
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </Drawer>
  );
}

function DebugKeyValueTable({
  data,
  title,
}: {
  data: Record<string, any>;
  title: string;
}) {
  const rows = Object.entries(data || {});
  if (!rows.length) return null;
  return (
    <Stack gap="xs">
      <Text fw={600}>{title}</Text>
      <Table withColumnBorders highlightOnHover horizontalSpacing="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>Value</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(([key, value]) => (
            <Table.Tr key={key}>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {key}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {formatValue(value)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function formatValue(value: any) {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
