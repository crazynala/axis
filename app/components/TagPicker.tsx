import { useEffect, useMemo, useState } from "react";
import { MultiSelect } from "@mantine/core";

export type TagPickerProps = {
  value: string[];
  onChange: (names: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
};

export function TagPicker({ value, onChange, placeholder = "Add tags", disabled, label }: TagPickerProps) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const u = new URL("/api/tags", window.location.origin);
        if (search.trim()) u.searchParams.set("q", search.trim());
        const resp = await fetch(u.toString(), { signal: controller.signal });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!active) return;
        setOptions((data?.options || []).map((o: any) => ({ value: String(o.value), label: String(o.label) })));
      } catch (_) {
        /* ignore */
      }
    };
    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [search]);

  const creatableData = useMemo(() => {
    const names = new Set(options.map((o) => o.value));
    for (const v of value) if (!names.has(v)) names.add(v);
    return Array.from(names)
      .sort()
      .map((n) => ({ value: n, label: n }));
  }, [options, value]);

  return (
    <MultiSelect
      data={creatableData}
      value={value}
      onChange={(vals) => onChange(vals)}
      searchable
      onSearchChange={setSearch}
      placeholder={placeholder}
      disabled={disabled}
      label={label}
      nothingFoundMessage={search ? "No matches" : "No tags yet"}
      clearable
    />
  );
}
