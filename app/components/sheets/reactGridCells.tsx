import { Select, Tooltip } from "@mantine/core";
import type {
  Cell,
  CellTemplate,
  Compatible,
  OptionType,
  Uncertain,
  UncertainCompatible,
} from "@silevis/reactgrid";
import { SkuLookupCell } from "./SkuLookupCell";

export type AxisTextCell = Cell & {
  type: "axisText";
  text: string;
  placeholder?: string;
  tooltip?: string;
  showNa?: boolean;
};

export type AxisHeaderCell = Cell & {
  type: "axisHeader";
  text: string;
  tooltip?: string;
};

export type AxisSelectCell = Cell & {
  type: "axisSelect";
  selectedValue?: string;
  values: OptionType[];
  placeholder?: string;
  tooltip?: string;
  showNa?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  displayText?: string;
};

export type AxisSkuCell = Cell & {
  type: "axisSku";
  text: string;
  tooltip?: string;
  showLookup?: boolean;
  onLookup?: () => void;
  onPaste?: (value: string) => void;
};

const normalizeText = (value: unknown) => {
  if (value == null) return "";
  return String(value);
};

const renderWithTooltip = (node: React.ReactNode, tooltip?: string) => {
  if (!tooltip) return node;
  return (
    <Tooltip label={tooltip} withArrow>
      <span>{node}</span>
    </Tooltip>
  );
};

const getInnerClassName = (cell: { className?: string }) => {
  const className = cell.className || "";
  if (className.includes("rg-rownum-cell")) return "axisRgRowNumInner";
  if (className.includes("rg-header-cell")) return "axisRgHeaderInner";
  return "axisRgCellInner";
};

export class AxisTextCellTemplate implements CellTemplate<AxisTextCell> {
  getCompatibleCell(uncertainCell: Uncertain<AxisTextCell>) {
    return {
      ...uncertainCell,
      type: "axisText",
      text: normalizeText(uncertainCell.text),
      nonEditable: !!uncertainCell.nonEditable,
      tooltip: uncertainCell.tooltip,
      showNa: uncertainCell.showNa,
      className: uncertainCell.className,
      style: uncertainCell.style,
    } as Compatible<AxisTextCell>;
  }

  update(
    cell: Compatible<AxisTextCell>,
    cellToMerge: UncertainCompatible<AxisTextCell>
  ) {
    return this.getCompatibleCell({ ...cell, ...cellToMerge });
  }

  getClassName(cell: Compatible<AxisTextCell>, isInEditMode: boolean) {
    if (isInEditMode) return "rg-axis-text-cell editing";
    return "rg-axis-text-cell";
  }

  render(
    cell: Compatible<AxisTextCell>,
    isInEditMode: boolean,
    onCellChanged: (cell: Compatible<AxisTextCell>, commit: boolean) => void
  ) {
    if (!cell.nonEditable && isInEditMode) {
      return (
        <input
          autoFocus
          value={cell.text}
          onChange={(e) =>
            onCellChanged({ ...cell, text: e.currentTarget.value }, false)
          }
          onBlur={() => onCellChanged(cell, true)}
          onKeyDown={(e) => {
            const isArrow = [
              "ArrowUp",
              "ArrowDown",
              "ArrowLeft",
              "ArrowRight",
            ].includes(e.key);
            if (!(e.shiftKey && isArrow)) {
              e.stopPropagation();
            }
            if (e.key === "Enter") onCellChanged(cell, true);
            if (e.key === "Escape") onCellChanged(cell, true);
          }}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
          }}
        />
      );
    }
    const text = cell.text?.trim?.() ? cell.text : "";
    const display =
      cell.nonEditable && cell.showNa && !text ? (
        <span style={{ color: "#8a8a8a" }}>N/A</span>
      ) : (
        text
      );
    return renderWithTooltip(
      <div className={getInnerClassName(cell)}>{display}</div>,
      cell.tooltip
    );
  }
}

export class AxisHeaderCellTemplate implements CellTemplate<AxisHeaderCell> {
  getCompatibleCell(uncertainCell: Uncertain<AxisHeaderCell>) {
    return {
      ...uncertainCell,
      type: "axisHeader",
      text: normalizeText(uncertainCell.text),
      nonEditable: true,
      tooltip: uncertainCell.tooltip,
      className: uncertainCell.className || "rg-header-cell",
      style: uncertainCell.style,
    } as Compatible<AxisHeaderCell>;
  }

  update(
    cell: Compatible<AxisHeaderCell>,
    cellToMerge: UncertainCompatible<AxisHeaderCell>
  ) {
    return this.getCompatibleCell({ ...cell, ...cellToMerge });
  }

  getClassName(cell: Compatible<AxisHeaderCell>) {
    return cell.className || "rg-header-cell";
  }

  render(cell: Compatible<AxisHeaderCell>) {
    return renderWithTooltip(
      <div className={getInnerClassName(cell)}>{cell.text}</div>,
      cell.tooltip
    );
  }
}

export class AxisSelectCellTemplate implements CellTemplate<AxisSelectCell> {
  getCompatibleCell(uncertainCell: Uncertain<AxisSelectCell>) {
    return {
      ...uncertainCell,
      type: "axisSelect",
      selectedValue:
        uncertainCell.selectedValue == null
          ? ""
          : String(uncertainCell.selectedValue),
      values: uncertainCell.values || [],
      nonEditable: !!uncertainCell.nonEditable,
      tooltip: uncertainCell.tooltip,
      showNa: uncertainCell.showNa,
      searchable: uncertainCell.searchable ?? true,
      clearable: uncertainCell.clearable ?? true,
      displayText: uncertainCell.displayText,
      className: uncertainCell.className,
      style: uncertainCell.style,
    } as Compatible<AxisSelectCell>;
  }

  update(
    cell: Compatible<AxisSelectCell>,
    cellToMerge: UncertainCompatible<AxisSelectCell>
  ) {
    return this.getCompatibleCell({ ...cell, ...cellToMerge });
  }

  getClassName(cell: Compatible<AxisSelectCell>, isInEditMode: boolean) {
    if (isInEditMode) return "rg-axis-select-cell editing";
    return "rg-axis-select-cell";
  }

  render(
    cell: Compatible<AxisSelectCell>,
    isInEditMode: boolean,
    onCellChanged: (cell: Compatible<AxisSelectCell>, commit: boolean) => void
  ) {
    const optionLabelByValue = new Map(
      (cell.values || []).map((opt) => [opt.value, opt.label] as const)
    );
    if (cell.nonEditable || !isInEditMode) {
      const label =
        cell.displayText ||
        optionLabelByValue.get(cell.selectedValue || "") ||
        "";
      const display =
        cell.showNa && !label ? (
          <span style={{ color: "#8a8a8a" }}>N/A</span>
        ) : (
          label
        );
      return renderWithTooltip(
        <div className={getInnerClassName(cell)}>{display}</div>,
        cell.tooltip
      );
    }
    const data = (cell.values || []).map((opt) => ({
      value: opt.value,
      label: opt.label,
      disabled: opt.isDisabled,
    }));
    return (
      <Select
        data={data}
        value={cell.selectedValue || null}
        searchable={cell.searchable ?? true}
        clearable={cell.clearable ?? true}
        withinPortal
        autoFocus
        onChange={(next) => {
          const selectedValue = next == null ? "" : String(next);
          const displayText = optionLabelByValue.get(selectedValue) || "";
          onCellChanged(
            { ...cell, selectedValue, displayText },
            true
          );
        }}
        onKeyDown={(e) => {
          const isArrow = [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
          ].includes(e.key);
          if (!(e.shiftKey && isArrow)) {
            e.stopPropagation();
          }
          if (e.key === "Escape") onCellChanged(cell, true);
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }
}

export class AxisSkuCellTemplate implements CellTemplate<AxisSkuCell> {
  getCompatibleCell(uncertainCell: Uncertain<AxisSkuCell>) {
    return {
      ...uncertainCell,
      type: "axisSku",
      text: normalizeText(uncertainCell.text),
      nonEditable: !!uncertainCell.nonEditable,
      tooltip: uncertainCell.tooltip,
      showLookup: uncertainCell.showLookup,
      onLookup: uncertainCell.onLookup,
      onPaste: uncertainCell.onPaste,
      className: uncertainCell.className,
      style: uncertainCell.style,
    } as Compatible<AxisSkuCell>;
  }

  update(
    cell: Compatible<AxisSkuCell>,
    cellToMerge: UncertainCompatible<AxisSkuCell>
  ) {
    return this.getCompatibleCell({ ...cell, ...cellToMerge });
  }

  getClassName(cell: Compatible<AxisSkuCell>, isInEditMode: boolean) {
    if (isInEditMode) return "rg-axis-sku-cell editing";
    return "rg-axis-sku-cell";
  }

  render(
    cell: Compatible<AxisSkuCell>,
    isInEditMode: boolean,
    onCellChanged: (cell: Compatible<AxisSkuCell>, commit: boolean) => void
  ) {
    if (cell.nonEditable || !isInEditMode) {
      return renderWithTooltip(
        <div className={getInnerClassName(cell)}>{cell.text}</div>,
        cell.tooltip
      );
    }
    return (
      <SkuLookupCell
        value={cell.text}
        focus={isInEditMode}
        readOnly={cell.nonEditable}
        showLookup={cell.showLookup}
        onLookup={cell.onLookup}
        onPaste={cell.onPaste}
        onChange={(value) =>
          onCellChanged({ ...cell, text: value }, false)
        }
        onBlur={() => onCellChanged(cell, true)}
      />
    );
  }
}

export const axisTextCellTemplate = new AxisTextCellTemplate();
export const axisHeaderCellTemplate = new AxisHeaderCellTemplate();
export const axisSelectCellTemplate = new AxisSelectCellTemplate();
export const axisSkuCellTemplate = new AxisSkuCellTemplate();
