import { Select } from "@mantine/core";
import { useMemo } from "react";

export type TaxCodeOption = { value: number; label: string };

export function TaxCodeSelect({
  value,
  onChange,
  options,
  label = "Purchase Tax",
  mod = "data-autosize",
  placeholder = "Select tax code",
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  options: TaxCodeOption[];
  label?: string;
  mod?: string;
  placeholder?: string;
}) {
  const data = useMemo(
    () => options.map((o) => ({ value: String(o.value), label: o.label })),
    [options]
  );
  const strVal = value == null ? null : String(value);
  return (
    <Select
      label={label}
      mod={mod as any}
      data={data}
      value={strVal}
      onChange={(v) => onChange(v == null || v === "" ? null : Number(v))}
      searchable
      clearable
      placeholder={placeholder}
    />
  );
}
