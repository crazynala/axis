import type { FormItem } from "./fieldConfigShared";
import type { UseFormReturn } from "react-hook-form";

export type GridSpan =
  | number
  | {
      base?: number;
      xs?: number;
      sm?: number;
      md?: number;
      lg?: number;
      xl?: number;
    };

export type PageNode = {
  kind: "page";
  gutter?: string | number;
  columns: ColumnNode[];
};

export type ColumnNode = {
  kind: "col";
  span: GridSpan;
  children: CardNode[];
};

export type EditablePredicate = (args: {
  form: UseFormReturn<any>;
  mode: "edit" | "find";
  ctx?: any;
}) => boolean;

export type UiMode = "normal" | "quiet";
export type UiModeResolver = UiMode | ((args: {
  form: UseFormReturn<any>;
  mode: "edit" | "find";
  ctx?: any;
}) => UiMode);
export type AllowEditResolver = boolean | EditablePredicate;

export type CardNode = {
  kind: "card";
  key: string;
  title?: string;
  cardProps?: Record<string, any>;
  items: FormItem[];
  drawerTitle?: string;
  drawerItems?: FormItem[];
  editableInlineWhen?: EditablePredicate;
  surfaceUiMode?: UiModeResolver;
  drawerUiMode?: UiModeResolver;
  surfaceAllowEdit?: AllowEditResolver;
  drawerAllowEdit?: AllowEditResolver;
  isDirtyWhen?: EditablePredicate;
  onSave?: (args: { form: UseFormReturn<any>; mode: "edit" | "find"; ctx?: any }) => void;
  onCancel?: (args: { form: UseFormReturn<any>; mode: "edit" | "find"; ctx?: any }) => void;
};
