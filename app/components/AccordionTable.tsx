import React, { useMemo, useState } from "react";
import { Table, ActionIcon, Text, ScrollArea, rem } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { debugEnabled } from "~/utils/debugFlags";

/**
 * Lightweight, dependency-free accordion table built on Mantine <Table />.
 * - Renders a second <tr> per row with a single <td colSpan> to host the subrow
 * - Uses <Collapse> for smooth open/close
 * - Keyboard-accessible toggle button with proper aria-expanded/state
 * - Keeps styling neutral so you can theme it easily
 */

export type Column<T> = {
  key: string; // unique key; also used for header cell key
  header: React.ReactNode;
  /** Render cell value for a given row */
  render: (row: T, rowIndex: number) => React.ReactNode;
  /** Optional fixed width (e.g. 120, "10%", "8rem") */
  width?: number | string;
  /** Optional text alignment */
  align?: "left" | "center" | "right";
};

export type AccordionTableProps<T> = {
  data: T[];
  columns: Column<T>[];
  /** Optional child rows (rendered inline as additional table rows) */
  getSubrows?: (row: T, rowIndex: number) => T[];

  /** Provide a stable unique id for each row */
  getRowId: (row: T, rowIndex: number) => string | number;

  /** Controlled expansion (optional) */
  expandedIds?: Array<string | number>;
  onExpandedChange?: (ids: Array<string | number>) => void;
  /** Uncontrolled default expansion */
  defaultExpandedIds?: Array<string | number>;

  /** If true, clicking the entire row toggles expansion (besides interactive elements) */
  expandOnRowClick?: boolean;
  /** If true, show a leading caret column */
  withCaret?: boolean;
  /** If true, place the caret button inside the first column instead of a separate leading column */
  caretInFirstColumn?: boolean;
  /** Hide caret (and disable toggle) when a row has 0 subrows and no renderSubrow content */
  hideCaretWhenEmpty?: boolean;

  /** Optional max height with sticky header via ScrollArea */
  height?: number | string;
  /** Dense row height */
  size?: "xs" | "sm" | "md" | "lg";
  /** Add zebra striping */
  striped?: boolean;
  /** Add subtle borders */
  withRowBorders?: boolean;
  /** Optional classNames/unstyled passthroughs can be added later */
  debug?: boolean;
};

export function AccordionTable<T>(props: AccordionTableProps<T>) {
  const {
    data: dataProp,
    columns: columnsProp,
    getSubrows,
    getRowId,
    expandedIds,
    onExpandedChange,
    defaultExpandedIds,
    expandOnRowClick = true,
    withCaret = true,
    caretInFirstColumn = false,
    hideCaretWhenEmpty = true,
    height,
    size = "sm",
    striped = false,
    withRowBorders = true,
  } = props;
  // Runtime guards to avoid SSR crashes if a caller passes undefined
  const data = Array.isArray(dataProp) ? dataProp : [];
  const columns = Array.isArray(columnsProp) ? columnsProp : [];
  const DEBUG = debugEnabled("accordionTable") || !!props.debug;

  const [internalExpanded, setInternalExpanded] = useState<
    Array<string | number>
  >(defaultExpandedIds ?? []);

  const expanded = expandedIds ?? internalExpanded;

  const setExpanded = (next: Array<string | number>) => {
    if (onExpandedChange) onExpandedChange(next);
    else setInternalExpanded(next);
  };

  const isExpanded = (id: string | number) => expanded.includes(id);

  const toggle = (id: string | number) => {
    setExpanded(
      isExpanded(id) ? expanded.filter((x) => x !== id) : [...expanded, id]
    );
  };

  const header = (
    <Table.Thead>
      <Table.Tr>
        {withCaret && !caretInFirstColumn && (
          <Table.Th style={{ width: rem(36) }} />
        )}
        {columns.map((col) => (
          <Table.Th
            key={col.key}
            style={{
              width: col.width,
              textAlign: (col.align as any) || undefined,
            }}
          >
            {col.header}
          </Table.Th>
        ))}
      </Table.Tr>
    </Table.Thead>
  );

  const body = (
    <Table.Tbody>
      {data.map((row, rowIndex) => {
        const id = getRowId(row, rowIndex);
        const expandedNow = isExpanded(id);
        const children = getSubrows ? getSubrows(row, rowIndex) ?? [] : [];
        const hasSubContent = children.length > 0;
        const showCaret = withCaret && (!hideCaretWhenEmpty || hasSubContent);
        if (DEBUG && rowIndex === 0) {
          console.debug("[AccordionTable] row", {
            id,
            childCount: children.length,
            hasSubContent,
            showCaret,
          });
        }

        const mainRow = (
          <Table.Tr
            key={String(id)}
            onClick={(e) => {
              if (!expandOnRowClick || !hasSubContent) return;
              const tag = (e.target as HTMLElement).closest(
                "button, a, input, textarea, [data-prevent-row-toggle]"
              );
              if (!tag) toggle(id);
            }}
            style={{
              cursor: expandOnRowClick && hasSubContent ? "pointer" : undefined,
            }}
          >
            {withCaret && !caretInFirstColumn && (
              <Table.Td style={{ width: rem(36), verticalAlign: "top" }}>
                {showCaret ? (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    aria-expanded={expandedNow}
                    aria-label={expandedNow ? "Collapse row" : "Expand row"}
                  >
                    {expandedNow ? (
                      <IconChevronDown size={16} />
                    ) : (
                      <IconChevronRight size={16} />
                    )}
                  </ActionIcon>
                ) : null}
              </Table.Td>
            )}

            {columns.map((col, ci) => (
              <Table.Td
                key={col.key}
                align={col.align}
                style={{ width: col.width }}
              >
                {withCaret && caretInFirstColumn && ci === 0 && showCaret ? (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    aria-expanded={expandedNow}
                    aria-label={expandedNow ? "Collapse row" : "Expand row"}
                    style={{ marginRight: rem(4) }}
                  >
                    {expandedNow ? (
                      <IconChevronDown size={16} />
                    ) : (
                      <IconChevronRight size={16} />
                    )}
                  </ActionIcon>
                ) : null}
                {col.render(row, rowIndex)}
              </Table.Td>
            ))}
          </Table.Tr>
        );

        const subRows =
          hasSubContent && expandedNow
            ? children.map((child, ci) => (
                <Table.Tr key={`${String(id)}-child-${ci}`}>
                  {withCaret && !caretInFirstColumn && (
                    <Table.Td
                      style={{ width: rem(36), verticalAlign: "top" }}
                    />
                  )}
                  {columns.map((c) => (
                    <Table.Td
                      key={c.key}
                      align={c.align}
                      style={{ width: c.width }}
                    >
                      {c.render(child, ci)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            : null;

        return (
          <React.Fragment key={`frag-${String(id)}`}>
            {mainRow}
            {subRows}
          </React.Fragment>
        );
      })}
    </Table.Tbody>
  );

  const table = (
    <Table
      striped={striped}
      withRowBorders={withRowBorders}
      highlightOnHover
      verticalSpacing={size}
      horizontalSpacing="sm"
      style={{ tableLayout: "fixed" }}
    >
      {header}
      {body}
    </Table>
  );

  if (height) {
    return (
      <ScrollArea h={height} type="auto" offsetScrollbars>
        {table}
      </ScrollArea>
    );
  }
  return table;
}

export default AccordionTable;
