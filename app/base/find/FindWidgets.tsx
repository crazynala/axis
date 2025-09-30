// app/find/FindWidgets.tsx
import { Group, NumberInput, TextInput, SegmentedControl, Switch } from "@mantine/core";
import { forwardRef } from "react";
import { useFind } from "./FindContext";

export function TriBool({ value, onChange, label }: { value: boolean | "any" | undefined; onChange: (v: boolean | "any") => void; label: string }) {
  const { mode } = useFind();
  if (mode === "edit") {
    return <Switch label={label} checked={!!(value === true)} onChange={(e) => onChange(e.currentTarget.checked)} />;
  }
  return (
    <Group gap="xs">
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <SegmentedControl
        value={String(value ?? "any")}
        onChange={(v) => onChange(v as any)}
        data={[
          { value: "any", label: "Any" },
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
      />
    </Group>
  );
}

export function NumberMaybeRange({
  label,
  value,
  onChange,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  value?: number | null;
  onChange?: (v: number | null) => void;
  minValue?: number | null;
  maxValue?: number | null;
  onMinChange?: (v: number | null) => void;
  onMaxChange?: (v: number | null) => void;
}) {
  const { mode } = useFind();
  if (mode === "edit") {
    return <NumberInput label={label} value={(value as any) ?? undefined} onChange={(v) => onChange?.((v as number) ?? null)} allowDecimal />;
  }
  return (
    <Group align="end" grow>
      <NumberInput label={`${label} (Min)`} value={(minValue as any) ?? undefined} onChange={(v) => onMinChange?.((v as number) ?? null)} allowDecimal />
      <NumberInput label={`${label} (Max)`} value={(maxValue as any) ?? undefined} onChange={(v) => onMaxChange?.((v as number) ?? null)} allowDecimal />
    </Group>
  );
}

export const TextAny = forwardRef<HTMLInputElement, React.ComponentProps<typeof TextInput>>(function TextAny(props, ref) {
  // Forward RHF register ref to Mantine's native input via inputRef
  return <TextInput {...props} ref={ref as any} />;
});
