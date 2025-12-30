import type { CardNode, ColumnNode, PageNode } from "./layoutTypes";
import type { FormItem } from "./fieldConfigShared";

export const L = {
  page: (
    opts: Omit<PageNode, "kind" | "columns">,
    ...columns: ColumnNode[]
  ): PageNode => ({
    kind: "page",
    ...opts,
    columns,
  }),
  col: (
    opts: Omit<ColumnNode, "kind" | "children">,
    ...children: CardNode[]
  ): ColumnNode => ({
    kind: "col",
    ...opts,
    children,
  }),
  card: (
    opts: Omit<CardNode, "kind" | "items">,
    ...items: FormItem[]
  ): CardNode => ({
    kind: "card",
    ...opts,
    items,
  }),
};
