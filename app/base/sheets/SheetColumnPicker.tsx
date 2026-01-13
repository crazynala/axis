import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconColumns } from "@tabler/icons-react";
import type { SheetColumnDef } from "./sheetSpec";
import type { SheetColumnRelevanceMap } from "./useSheetColumns";

type SheetColumnPickerProps<Row> = {
  columns: SheetColumnDef<Row>[];
  selectedKeys: string[];
  onChange: (next: string[]) => void;
  defaultKeys: string[];
  relevanceByKey?: SheetColumnRelevanceMap;
  widthPresetByKey?: Record<string, string>;
  onWidthPresetChange?: (key: string, presetId: string) => void;
  buttonLabel?: string;
};

const groupBySection = <Row,>(columns: SheetColumnDef<Row>[]) => {
  const base: SheetColumnDef<Row>[] = [];
  const metadata: SheetColumnDef<Row>[] = [];
  for (const col of columns) {
    if (col.section === "metadata") metadata.push(col);
    else base.push(col);
  }
  return { base, metadata };
};

const groupByGroup = <Row,>(columns: SheetColumnDef<Row>[]) => {
  const map = new Map<string, SheetColumnDef<Row>[]>();
  const order: string[] = [];
  for (const col of columns) {
    const group = col.group || "Columns";
    if (!map.has(group)) {
      map.set(group, []);
      order.push(group);
    }
    map.get(group)?.push(col);
  }
  return order.map((group) => [group, map.get(group) || []] as const);
};

const moveKey = (keys: string[], key: string, delta: number) => {
  const idx = keys.indexOf(key);
  if (idx < 0) return keys;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= keys.length) return keys;
  const next = [...keys];
  const [moved] = next.splice(idx, 1);
  next.splice(nextIdx, 0, moved);
  return next;
};

export function SheetColumnPicker<Row>({
  columns,
  selectedKeys,
  onChange,
  defaultKeys,
  relevanceByKey,
  widthPresetByKey,
  onWidthPresetChange,
  buttonLabel = "Columns",
}: SheetColumnPickerProps<Row>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedKeys);
  const [search, setSearch] = useState("");
  const selectedKeySet = useMemo(() => new Set(draft), [draft]);
  const columnsByKey = useMemo(
    () => new Map(columns.map((col) => [col.key, col] as const)),
    [columns]
  );

  useEffect(() => {
    if (!open) return;
    setDraft(selectedKeys);
    setSearch("");
  }, [open, selectedKeys]);

  const selectedColumns = useMemo(
    () => draft.map((key) => columnsByKey.get(key)).filter(Boolean) as SheetColumnDef<Row>[],
    [columnsByKey, draft]
  );

  const { base: baseColumns, metadata: metadataColumns } = useMemo(
    () => groupBySection(columns),
    [columns]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (col: SheetColumnDef<Row>) => {
    if (!normalizedSearch) return true;
    const label = String(col.label || "").toLowerCase();
    const key = String(col.key || "").toLowerCase();
    return label.includes(normalizedSearch) || key.includes(normalizedSearch);
  };

  const renderAvailableGroups = (sectionCols: SheetColumnDef<Row>[]) => {
    const groups = groupByGroup(sectionCols);
    return groups.map(([group, groupCols]) => {
      const totalCount = groupCols.length;
      const selectedCount = groupCols.filter((col) =>
        selectedKeySet.has(col.key)
      ).length;
      const visibleCols = groupCols.filter(
        (col) => !selectedKeySet.has(col.key) && matchesSearch(col)
      );
      if (!visibleCols.length) return null;
      const addAll = () => {
        const nextKeys = groupCols.map((col) => col.key);
        setDraft((prev) => {
          const merged = [...prev, ...nextKeys];
          return Array.from(new Set(merged));
        });
      };
      const removeAll = () => {
        setDraft((prev) =>
          prev.filter((key) => {
            const col = columnsByKey.get(key);
            if (!col) return true;
            if (col.group !== group) return true;
            return col.hideable === false;
          })
        );
      };
      return (
      <Stack key={group} gap={6}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="sm" fw={600}>
            {group} ({selectedCount}/{totalCount})
          </Text>
          <Group gap={6}>
            <Button size="xs" variant="subtle" onClick={addAll}>
              Add all
            </Button>
            <Button size="xs" variant="subtle" onClick={removeAll}>
              Remove all
            </Button>
          </Group>
        </Group>
        {visibleCols.map((col) => {
          const relevance = relevanceByKey?.[col.key];
          const isRelevant = relevance ? relevance.relevant : true;
          const disabled = !isRelevant;
          const label = col.label;
          const checkbox = (
            <Checkbox
              size="sm"
              label={label}
              checked={selectedKeySet.has(col.key)}
              disabled={disabled}
              onChange={(e) => {
                const nextChecked = e.currentTarget.checked;
                setDraft((prev) => {
                  const exists = prev.includes(col.key);
                  if (nextChecked && !exists) return [...prev, col.key];
                  if (!nextChecked && exists) {
                    return prev.filter((k) => k !== col.key);
                  }
                  return prev;
                });
              }}
            />
          );
          if (!disabled) return <Group key={col.key}>{checkbox}</Group>;
          const reason = relevance?.reason || "Not applicable to any rows in this sheet";
          return (
            <Tooltip key={col.key} label={reason} withArrow>
              <Group>{checkbox}</Group>
            </Tooltip>
          );
        })}
      </Stack>
      );
    });
  };

  return (
    <>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconColumns size={14} />}
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </Button>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Columns"
        size="lg"
      >
        <Stack gap="sm">
          <TextInput
            placeholder="Search columns..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <ScrollArea type="auto" h={320}>
            <Stack gap="sm">
              <Stack gap={6}>
                <Text size="sm" fw={600}>
                  Selected ({selectedColumns.length})
                </Text>
                {selectedColumns.map((col) => {
                  const hideable = col.hideable !== false;
                  const checked = selectedKeySet.has(col.key);
                  const presets = col.widthPresets || [];
                  const presetValue =
                    widthPresetByKey?.[col.key] ||
                    col.defaultWidthPresetId ||
                    presets[0]?.id ||
                    "";
                  return (
                    <Group
                      key={col.key}
                      justify="space-between"
                      align="center"
                      wrap="nowrap"
                    >
                      <Checkbox
                        size="sm"
                        label={col.label}
                        checked={checked || !hideable}
                        disabled={!hideable}
                        onChange={(e) => {
                          const nextChecked = e.currentTarget.checked;
                          setDraft((prev) => {
                            const exists = prev.includes(col.key);
                            if (nextChecked && !exists)
                              return [...prev, col.key];
                            if (!nextChecked && exists) {
                              return prev.filter((k) => k !== col.key);
                            }
                            return prev;
                          });
                        }}
                      />
                      <Group gap={6} wrap="nowrap">
                        {presets.length > 0 && onWidthPresetChange ? (
                          <SegmentedControl
                            size="xs"
                            data={presets.map((preset) => ({
                              label: preset.label,
                              value: preset.id,
                            }))}
                            value={presetValue}
                            onChange={(value) => {
                              if (!value) return;
                              onWidthPresetChange(col.key, value);
                            }}
                          />
                        ) : null}
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() =>
                            setDraft((prev) => moveKey(prev, col.key, -1))
                          }
                        >
                          <IconChevronUp size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() =>
                            setDraft((prev) => moveKey(prev, col.key, 1))
                          }
                        >
                          <IconChevronDown size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  );
                })}
                <Divider />
              </Stack>
              {renderAvailableGroups(baseColumns)}
              {baseColumns.length && metadataColumns.length ? <Divider /> : null}
              {metadataColumns.length ? renderAvailableGroups(metadataColumns) : null}
            </Stack>
          </ScrollArea>
          <Group justify="space-between">
            <Button
              size="xs"
              variant="default"
              onClick={() => setDraft(defaultKeys)}
            >
              Reset to defaults
            </Button>
            <Group gap="xs">
              <Button
                size="xs"
                variant="default"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function SheetColumnPickerButton<Row>({
  buttonLabel,
  ...props
}: SheetColumnPickerProps<Row>) {
  return <SheetColumnPicker {...props} buttonLabel={buttonLabel} />;
}
