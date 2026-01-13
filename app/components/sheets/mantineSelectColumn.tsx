import { useEffect, useMemo, useState } from "react";
import { Select } from "@mantine/core";
import type { CellProps, Column } from "react-datasheet-grid";
import * as RDG from "react-datasheet-grid";

export type MantineSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type MantineSelectColumnOptions<Row> = {
  key: keyof Row & string;
  title: string;
  options?: MantineSelectOption[];
  getOptions?: (row: Row) => MantineSelectOption[];
  searchable?: boolean;
  clearable?: boolean;
  disabled?: (row: Row) => boolean;
};

export function mantineSelectColumn<Row>(
  options: MantineSelectColumnOptions<Row>
): Column<Row> {
  const {
    key,
    title,
    options: staticOptions,
    getOptions,
    searchable = true,
    clearable = true,
    disabled,
  } = options;

  const SelectCell = (props: CellProps<any, any>) => {
    const { rowData, setRowData, focus, stopEditing } = props;
    const row = rowData as Row;
    const resolvedOptions = useMemo(() => {
      if (getOptions) return getOptions(row);
      return staticOptions || [];
    }, [getOptions, row, staticOptions]);
    const labelByValue = useMemo(() => {
      const map = new Map<string, string>();
      resolvedOptions.forEach((opt) => map.set(String(opt.value), opt.label));
      return map;
    }, [resolvedOptions]);
    const value = row ? ((row as any)[key] ?? "") : "";
    const normalizedValue = value == null ? "" : String(value);
    const isDisabled = disabled ? disabled(row) : false;
    const [opened, setOpened] = useState(false);

    useEffect(() => {
      if (focus && !isDisabled) {
        setOpened(true);
      } else {
        setOpened(false);
      }
    }, [focus, isDisabled]);

    if (!focus || isDisabled) {
      const label =
        labelByValue.get(normalizedValue) ??
        (normalizedValue ? String(normalizedValue) : "");
      return (
        <div style={{ width: "100%", height: "100%", padding: "0 6px" }}>
          {label}
        </div>
      );
    }

    return (
      <Select
        data={resolvedOptions}
        value={normalizedValue || null}
        onChange={(next) => {
          const nextValue = next == null ? "" : next;
          setRowData({ ...(row as any), [key]: nextValue } as any);
          stopEditing?.({ nextRow: false });
        }}
        searchable={searchable}
        clearable={clearable}
        withinPortal
        dropdownOpened={opened}
        onDropdownOpen={() => setOpened(true)}
        onDropdownClose={() => {
          setOpened(false);
          stopEditing?.({ nextRow: false });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            stopEditing?.({ nextRow: false });
          }
          if (e.key === "Enter" && !opened) {
            setOpened(true);
          }
        }}
        onFocus={() => setOpened(true)}
      />
    );
  };

  return {
    ...((RDG.keyColumn as any)(key as any, RDG.textColumn) as any),
    id: key,
    title,
    component: SelectCell as any,
  } as Column<Row>;
}
