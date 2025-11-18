import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Tabs,
  Text,
  TextInput,
  rem,
  ScrollArea,
} from "@mantine/core";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import { CloseButton } from "@mantine/core";

export type FilterChip = {
  key: string;
  label: string;
};

export type FindRibbonProps = {
  mode: "view" | "find";
  views: Array<string | { value: string; label: string }>;
  activeView: string | null;
  onSelectView: (view: string) => void;
  filterChips?: FilterChip[];
  onCancelFind?: () => void;
  onSaveAs?: (name: string) => void; // if provided, shows Save As button and modal
  title?: string; // optional left title
  onRemoveChip?: (key: string) => void; // enable 'x' per chip
  advancedActive?: boolean; // show an Advanced chip when true
  onClearAdvanced?: () => void; // clear advanced findReqs
};

/**
 * FindRibbon renders a single-line ribbon across the screen.
 * - View mode: shows Mantine Tabs for available views.
 * - Find mode: shows active filter chips and actions (Cancel, Save as).
 */

export function FindRibbon({
  mode,
  views,
  activeView,
  onSelectView,
  filterChips = [],
  onCancelFind,
  onSaveAs,
  title,
  onRemoveChip,
  advancedActive,
  onClearAdvanced,
}: FindRibbonProps) {
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");

  const normalizedViews = useMemo(
    () =>
      views.map((v) =>
        typeof v === "string"
          ? { value: v, label: v }
          : { value: v.value, label: v.label }
      ),
    [views]
  );

  return (
    // <Paper
    //   withBorder
    //   p="xs"
    //   radius="sm"
    //   style={{
    //     width: "100%",
    //     background: "var(--mantine-color-gray-0)",
    //     position: "relative",
    //   }}
    // >
    <Box>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" align="center">
          {title ? <Text fw={600}>{title}</Text> : null}
          {mode === "view" ? (
            <Tabs
              value={activeView || normalizedViews[0]?.value}
              onChange={(v) => v && onSelectView(v)}
            >
              <Tabs.List>
                {normalizedViews.map((v) => (
                  <Tabs.Tab key={v.value} value={v.value}>
                    {v.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          ) : (
            <Group
              gap="xs"
              wrap="nowrap"
              align="center"
              style={{ maxWidth: "100%" }}
            >
              <Text c="dimmed" size="sm">
                Active filters
              </Text>
              <ScrollArea
                type="auto"
                scrollHideDelay={0}
                style={{ maxWidth: "min(70vw, 100%)" }}
              >
                <Group gap={6} wrap="nowrap">
                  {filterChips.length ? (
                    <>
                      {filterChips.map((c) => (
                        <Badge
                          key={c.key}
                          variant="light"
                          radius="sm"
                          styles={{ root: { fontWeight: 500 } }}
                          rightSection={
                            onRemoveChip ? (
                              <CloseButton
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveChip(c.key);
                                }}
                                aria-label={`Remove ${c.key}`}
                              />
                            ) : undefined
                          }
                        >
                          {c.label}
                        </Badge>
                      ))}
                      {advancedActive ? (
                        <Badge
                          key="advanced"
                          variant="light"
                          radius="sm"
                          color="grape"
                          rightSection={
                            onClearAdvanced ? (
                              <CloseButton
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClearAdvanced();
                                }}
                                aria-label={`Remove advanced`}
                              />
                            ) : undefined
                          }
                        >
                          Advanced
                        </Badge>
                      ) : null}
                    </>
                  ) : (
                    <Badge variant="light" radius="sm">
                      No criteria
                    </Badge>
                  )}
                </Group>
              </ScrollArea>
            </Group>
          )}
        </Group>

        {mode === "find" ? (
          <Group gap="xs" align="center">
            {onCancelFind ? (
              <Button variant="default" onClick={onCancelFind}>
                Cancel
              </Button>
            ) : null}
            {onSaveAs ? (
              <Button onClick={() => setOpened(true)}>Save as</Button>
            ) : null}
          </Group>
        ) : null}
      </Group>

      {onSaveAs ? (
        <Modal
          opened={opened}
          onClose={() => setOpened(false)}
          title="Save current filters as view"
          size="sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return;
              onSaveAs(trimmed);
              setOpened(false);
              setName("");
            }}
          >
            <Group align="end" gap="sm">
              <TextInput
                label="View name"
                placeholder="Name your view"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                w={rem(260)}
              />
              <Button type="submit">Save</Button>
            </Group>
          </form>
        </Modal>
      ) : null}
    </Box>
  );
}

export function defaultSummarizeFilters(
  params: Record<string, string | number | boolean | null | undefined>,
  options?: {
    excludeKeys?: string[];
    labelMap?: Record<string, string>;
  }
): FilterChip[] {
  const exclude = new Set(options?.excludeKeys || []);
  const chips: FilterChip[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (exclude.has(k)) continue;
    const labelKey = options?.labelMap?.[k] || k;
    chips.push({ key: k, label: `${labelKey}: ${String(v)}` });
  }
  return chips;
}
