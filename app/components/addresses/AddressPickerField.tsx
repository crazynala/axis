import { Link } from "@remix-run/react";
import { useMemo } from "react";
import { Group, Select, Stack, Text } from "@mantine/core";
import type { SelectProps } from "@mantine/core";
import { formatAddressLines, type AddressLike } from "~/utils/addressFormat";

export type AddressPickerOption = { value: string; label: string; group?: string };
export type AddressPickerOptions = SelectProps["data"];

export type AddressPickerFieldProps = {
  label: string;
  value: number | null;
  options: AddressPickerOptions;
  onChange: (nextId: number | null) => void;
  previewAddress?: AddressLike | null;
  hint?: React.ReactNode;
  allowClear?: boolean;
  disabled?: boolean;
  showOpenLink?: boolean;
};

export function AddressPickerField({
  label,
  value,
  options,
  onChange,
  previewAddress,
  hint,
  allowClear = true,
  disabled = false,
  showOpenLink = true,
}: AddressPickerFieldProps) {
  const lines = previewAddress ? formatAddressLines(previewAddress) : [];
  const hasSelection = value != null && Number.isFinite(value);
  const safeOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const ungrouped: { value: string; label: string }[] = [];
    const grouped = new Map<string, { group: string; items: { value: string; label: string }[] }>();
    const pushGrouped = (groupLabel: string, item: { value: string; label: string }) => {
      const key = groupLabel.trim();
      if (!key) {
        ungrouped.push(item);
        return;
      }
      if (!grouped.has(key)) grouped.set(key, { group: key, items: [] });
      grouped.get(key)!.items.push(item);
    };
    const toItem = (valueRaw: any, labelRaw: any) => {
      const value = typeof valueRaw === "string" ? valueRaw.trim() : "";
      const label = typeof labelRaw === "string" ? labelRaw.trim() : "";
      return value && label ? { value, label } : null;
    };

    options.forEach((item) => {
      if (item == null) return;
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed) ungrouped.push({ value: trimmed, label: trimmed });
        return;
      }
      if (typeof item !== "object") return;

      if ("group" in item && "items" in item) {
        const groupLabel =
          typeof (item as any).group === "string" ? (item as any).group : "";
        const items = Array.isArray((item as any).items)
          ? (item as any).items
              .map((nested: any) => {
                if (!nested || typeof nested !== "object") return null;
                return toItem((nested as any).value, (nested as any).label);
              })
              .filter(Boolean)
          : [];
        if (groupLabel && items.length) {
          grouped.set(groupLabel.trim(), {
            group: groupLabel.trim(),
            items: items as { value: string; label: string }[],
          });
        }
        return;
      }

      const next = toItem((item as any).value, (item as any).label);
      if (!next) return;
      const groupLabel =
        typeof (item as any).group === "string" ? (item as any).group : "";
      if (groupLabel) {
        pushGrouped(groupLabel, next);
      } else {
        ungrouped.push(next);
      }
    });

    return [...ungrouped, ...Array.from(grouped.values())];
  }, [options]);
  return (
    <Stack gap={4}>
      <Select
        label={label}
        data={safeOptions}
        value={hasSelection ? String(value) : null}
        onChange={(next) => {
          if (!next) {
            onChange(null);
            return;
          }
          const parsed = Number(next);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        clearable={allowClear}
        disabled={disabled}
      />
      {hasSelection ? (
        <Stack gap={2}>
          {lines.length ? (
            lines.map((line) => (
              <Text key={line} size="sm">
                {line}
              </Text>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No address details available.
            </Text>
          )}
          {showOpenLink ? (
            <Group gap="xs">
              <Link to={`/addresses/${value}`}>Open address</Link>
            </Group>
          ) : null}
        </Stack>
      ) : hint ? (
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
}
