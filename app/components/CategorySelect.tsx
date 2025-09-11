import { Select } from "@mantine/core";
import { useMemo } from "react";

export type CategoryOption = { value: number; label: string };

export function CategorySelect({
  value,
  onChange,
  options,
  label = "Category",
  mod = "data-autosize",
  placeholder = "Select category",
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  options: CategoryOption[];
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
      nothingFoundMessage="No categories"
    />
  );
}
