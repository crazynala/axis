import { Select } from "@mantine/core";
import { useMemo } from "react";

export type CompanyOption = {
  value: number;
  label: string;
  isCustomer?: boolean | null;
  isSupplier?: boolean | null;
  isCarrier?: boolean | null;
};

type FilterKind = "customer" | "supplier" | "carrier" | undefined;

export function CompanySelect({
  value,
  onChange,
  options,
  label = "Company",
  mod = "data-autoSize",
  placeholder = "Select company",
  filter,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  options: CompanyOption[];
  label?: string;
  mod?: string;
  placeholder?: string;
  filter?: FilterKind;
}) {
  const data = useMemo(() => {
    let arr = options;
    if (filter === "customer") arr = arr.filter((o) => !!o.isCustomer);
    if (filter === "supplier") arr = arr.filter((o) => !!o.isSupplier);
    if (filter === "carrier") arr = arr.filter((o) => !!o.isCarrier);
    return arr.map((o) => ({ value: String(o.value), label: o.label }));
  }, [options, filter]);
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
      nothingFoundMessage="No matches"
    />
  );
}
