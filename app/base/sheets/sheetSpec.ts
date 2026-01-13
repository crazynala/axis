export type SheetColumnSection = "base" | "metadata";

export type SheetColumnDef<Row = Record<string, any>> = {
  key: string;
  label: string;
  accessor?: string;
  editable?: boolean;
  widget?: string;
  defaultVisible?: boolean;
  hideable?: boolean;
  group?: string;
  section?: SheetColumnSection;
  relevanceKey?: string;
  baseWidthPx?: number;
  widthPresets?: Array<{ id: string; label: string; px?: number }>;
  defaultWidthPresetId?: string;
  grow?: boolean | number;
  isApplicable?: (row: Row) => boolean;
  getInapplicableReason?: (row: Row) => string | undefined;
  isRelevant?: (rows: Row[]) => boolean;
};

export type SheetViewSpec<Row = Record<string, any>> = {
  id: string;
  label: string;
  columns: SheetColumnDef<Row>[];
  defaultColumns?: string[];
};

export type ModuleSheetSpec<Row = Record<string, any>> = {
  views: Record<string, SheetViewSpec<Row>>;
};

export type SheetColumnSelection = {
  version: 1;
  columns: string[];
  widthPresetByKey?: Record<string, string>;
};
