import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Drawer,
  Group,
  Stack,
  Tabs,
  Table,
  Switch,
  Text,
  Code,
  ScrollArea,
} from "@mantine/core";
import type { DebugExplainPayload } from "~/modules/debug/types";
import {
  getDebug,
  listDebug,
  setDebug,
  type DebugFlagsMap,
} from "~/utils/debugFlags";

const TAB_STORAGE_KEY = "debugDrawerTab";
const DEBUG_FLAG_SPECS: Array<{
  key: string;
  label: string;
  description: string;
}> = [
  {
    key: "DEBUG_SHEET_HISTORY",
    label: "Sheet history logs",
    description: "Logs undo/redo transactions, history pushes, and diffs.",
  },
  {
    key: "DEBUG_SHEET_PASTE",
    label: "Sheet paste logs",
    description: "Logs paste routing and focus state inside sheets.",
  },
];

type DebugDrawerProps = {
  opened: boolean;
  onClose: () => void;
  title: string;
  payload?: DebugExplainPayload | null;
  loading?: boolean;
  formStatePanel?: ReactNode;
  formStateCopyText?: string;
  extraTabs?: Array<{
    key: string;
    label: string;
    render: (ctx: { active: boolean }) => ReactNode;
    copyText?: string;
  }>;
};

export function DebugDrawer({
  opened,
  onClose,
  title,
  payload,
  loading,
  formStatePanel,
  formStateCopyText,
  extraTabs,
}: DebugDrawerProps) {
  const [tab, setTab] = useState<string>("summary");
  const [flagVersion, setFlagVersion] = useState(0);

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

  const numbersText = useMemo(() => {
    if (!payload) return "";
    return JSON.stringify(
      {
        rollups: payload.rollups ?? null,
        inputs: payload.inputs ?? null,
        derived: payload.derived ?? null,
      },
      null,
      2
    );
  }, [payload]);

  const extraCopyMap = useMemo(() => {
    const map = new Map<string, string>();
    (extraTabs || []).forEach((tab) => {
      if (tab.copyText) map.set(tab.key, tab.copyText);
    });
    return map;
  }, [extraTabs]);

  const activeCopyText = useMemo(() => {
    if (tab === "summary") return summaryText;
    if (tab === "numbers") return numbersText;
    if (tab === "json") return jsonText;
    if (tab === "flags") return JSON.stringify(listDebug(), null, 2);
    if (tab === "formState") return formStateCopyText || "";
    if (extraCopyMap.has(tab)) return extraCopyMap.get(tab) || "";
    return "";
  }, [extraCopyMap, formStateCopyText, jsonText, numbersText, summaryText, tab]);

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

  const hasPayload = !!payload;
  const hasFormState = !!formStatePanel;
  const showTabs = true;
  const availableTabs = useMemo(() => {
    const base = ["summary", "numbers", "json", "flags"];
    if (hasFormState) base.push("formState");
    (extraTabs || []).forEach((t) => base.push(t.key));
    return new Set(base);
  }, [extraTabs, hasFormState]);

  useEffect(() => {
    if (!hasFormState && tab === "formState") {
      setTab("summary");
    }
  }, [hasFormState, tab]);
  useEffect(() => {
    if (!availableTabs.has(tab)) {
      setTab("summary");
    }
  }, [availableTabs, tab]);

  const storedFlags = useMemo<DebugFlagsMap>(() => {
    return listDebug();
  }, [flagVersion, opened]);

  const flagsList = useMemo(() => {
    const specKeys = new Set(DEBUG_FLAG_SPECS.map((flag) => flag.key));
    const extras = Object.keys(storedFlags).filter((key) => !specKeys.has(key));
    return [
      ...DEBUG_FLAG_SPECS,
      ...extras.map((key) => ({
        key,
        label: key,
        description: "Custom debug flag.",
      })),
    ];
  }, [storedFlags]);

  const handleFlagToggle = (key: string, value: boolean) => {
    setDebug(key, value);
    setFlagVersion((prev) => prev + 1);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={title}
      position="right"
      size="lg"
    >
      <Stack gap="sm">
        <Group justify="flex-end" gap="xs">
          <Button
            size="xs"
            variant="light"
            onClick={() => handleCopy(activeCopyText)}
            disabled={!activeCopyText}
          >
            Copy tab
          </Button>
        </Group>
        {loading && !hasFormState ? (
          <Text size="sm" c="dimmed">
            Loading debug payload…
          </Text>
        ) : showTabs ? (
          <Tabs value={tab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="summary">Summary</Tabs.Tab>
              <Tabs.Tab value="numbers">Numbers</Tabs.Tab>
              <Tabs.Tab value="json">JSON</Tabs.Tab>
              <Tabs.Tab value="flags">Flags</Tabs.Tab>
            {hasFormState ? (
              <Tabs.Tab value="formState">Form State</Tabs.Tab>
            ) : null}
            {(extraTabs || []).map((tab) => (
              <Tabs.Tab key={tab.key} value={tab.key}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
            <Tabs.Panel value="summary" pt="sm">
              {payload ? (
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
              ) : (
                <Text size="sm" c="dimmed">
                  No debug payload loaded.
                </Text>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="numbers" pt="sm">
              {payload ? (
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
              ) : (
                <Text size="sm" c="dimmed">
                  No debug payload loaded.
                </Text>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="json" pt="sm">
              {payload ? (
                <ScrollArea h={400}>
                  <Code block>{jsonText}</Code>
                </ScrollArea>
              ) : (
                <Text size="sm" c="dimmed">
                  No debug payload loaded.
                </Text>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="flags" pt="sm">
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  Flags persist in localStorage. You can also toggle via
                  window.__DEBUG__.set(name, true).
                </Text>
                <Table withColumnBorders={false} withRowBorders>
                  <Table.Tbody>
                    {flagsList.map((flag) => (
                      <Table.Tr key={flag.key}>
                        <Table.Td>
                          <Text fw={600} size="sm">
                            {flag.label}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {flag.description}
                          </Text>
                        </Table.Td>
                        <Table.Td w={80}>
                          <Switch
                            aria-label={`Toggle ${flag.label}`}
                            checked={getDebug(flag.key)}
                            onChange={(e) =>
                              handleFlagToggle(flag.key, e.currentTarget.checked)
                            }
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Tabs.Panel>
            {hasFormState ? (
              <Tabs.Panel value="formState" pt="sm">
                {formStatePanel}
              </Tabs.Panel>
            ) : null}
            {(extraTabs || []).map((tabItem) => {
              const isActive = tab === tabItem.key;
              return (
                <Tabs.Panel key={tabItem.key} value={tabItem.key} pt="sm">
                  {tabItem.render({ active: isActive })}
                </Tabs.Panel>
              );
            })}
          </Tabs>
        ) : (
          <Text size="sm" c="dimmed">
            No debug payload loaded.
          </Text>
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
