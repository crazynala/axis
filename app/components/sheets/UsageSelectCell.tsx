import { NativeSelect } from "@mantine/core";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

export type UsageValue = "cut" | "make" | "";

export function normalizeUsageValue(value: unknown): UsageValue {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  return trimmed === "cut" || trimmed === "make" ? trimmed : "";
}

export type SheetSelectOption = { label: string; value: string };

type SheetSelectCellProps = {
  value: string;
  options: SheetSelectOption[];
  focus?: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  textTransform?: CSSProperties["textTransform"];
};

export function SheetSelectCell({
  value,
  options,
  focus,
  readOnly = false,
  onChange,
  onBlur,
  textTransform,
}: SheetSelectCellProps) {
  const ref = useRef<HTMLSelectElement | null>(null);
  useEffect(() => {
    if (focus && !readOnly) ref.current?.focus();
    else if (!focus && ref.current) ref.current.blur();
  }, [focus, readOnly]);

  if (readOnly) return <div style={{ width: "100%", height: "100%" }} />;

  return (
    <NativeSelect
      ref={ref}
      value={value}
      data={options}
      onChange={(event) => onChange(event.currentTarget.value)}
      onBlur={onBlur}
      size="xs"
      styles={{
        input: {
          border: "none",
          background: "transparent",
          boxShadow: "none",
          height: "100%",
          paddingLeft: 4,
          paddingRight: 20,
          textTransform,
        },
        wrapper: { height: "100%" },
      }}
    />
  );
}

type UsageSelectCellProps = {
  value: UsageValue;
  focus?: boolean;
  readOnly?: boolean;
  onChange: (value: UsageValue) => void;
  onBlur?: () => void;
};

const OPTIONS: { label: string; value: UsageValue }[] = [
  { label: "", value: "" },
  { label: "Cut", value: "cut" },
  { label: "Make", value: "make" },
];

export function UsageSelectCell({
  value,
  focus,
  readOnly,
  onChange,
  onBlur,
}: UsageSelectCellProps) {
  const safeValue = useMemo(() => normalizeUsageValue(value), [value]);

  return (
    <SheetSelectCell
      value={safeValue}
      options={OPTIONS}
      focus={focus}
      readOnly={readOnly}
      onBlur={onBlur}
      textTransform="capitalize"
      onChange={(next) => onChange(next as UsageValue)}
    />
  );
}
