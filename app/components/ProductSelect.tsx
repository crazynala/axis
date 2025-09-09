import { Select } from "@mantine/core";
import { useMemo } from "react";

export type ProductOption = {
  value: number;
  label: string; // usually name or sku + name
  sku?: string | null;
  name?: string | null;
};

export function ProductSelect({
  value,
  onChange,
  options,
  label = "Product",
  mod = "data-autoSize",
  placeholder = "Select product",
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  options: ProductOption[];
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
      nothingFoundMessage="No products"
    />
  );
}
