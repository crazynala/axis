import { Checkbox } from "@mantine/core";

type SheetCheckboxCellProps = {
  checked: boolean;
  readOnly?: boolean;
  onChange: (value: boolean) => void;
};

export function SheetCheckboxCell({
  checked,
  readOnly = false,
  onChange,
}: SheetCheckboxCellProps) {
  if (readOnly) return <div style={{ width: "100%", height: "100%" }} />;
  return (
    <Checkbox
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      size="xs"
      style={{ pointerEvents: "auto" }}
    />
  );
}
