import { Link } from "@remix-run/react";
import { Group, Select, Stack, Text } from "@mantine/core";
import { formatAddressLines, type AddressLike } from "~/utils/addressFormat";

export type AddressPickerOption = { value: string; label: string };

export type AddressPickerFieldProps = {
  label: string;
  value: number | null;
  options: AddressPickerOption[];
  onChange: (nextId: number | null) => void;
  previewAddress?: AddressLike | null;
  hint?: React.ReactNode;
  allowClear?: boolean;
  disabled?: boolean;
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
}: AddressPickerFieldProps) {
  const lines = previewAddress ? formatAddressLines(previewAddress) : [];
  const hasSelection = value != null && Number.isFinite(value);
  return (
    <Stack gap={4}>
      <Select
        label={label}
        data={options}
        value={hasSelection ? String(value) : ""}
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
          <Group gap="xs">
            <Link to={`/addresses/${value}`}>Open address</Link>
          </Group>
        </Stack>
      ) : hint ? (
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
}
