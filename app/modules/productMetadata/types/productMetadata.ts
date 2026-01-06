export type ProductAttributeDataType =
  | "STRING"
  | "NUMBER"
  | "ENUM"
  | "BOOLEAN"
  | "JSON";

export type ProductAttributeDisplayWidth = "full" | "half" | "third";

export type ProductAttributeOption = {
  id: number;
  definitionId: number;
  label: string;
  slug: string;
  isArchived: boolean;
  mergedIntoId: number | null;
};

export type ProductAttributeDefinition = {
  id: number;
  key: string;
  label: string;
  dataType: ProductAttributeDataType;
  isRequired: boolean;
  isFilterable: boolean;
  enumOptions: any | null;
  validation: any | null;
  appliesToProductTypes: string[];
  appliesToCategoryIds?: number[];
  appliesToSubcategoryIds?: number[];
  displayWidth?: ProductAttributeDisplayWidth;
  sortOrder: number;
  options?: ProductAttributeOption[];
};

export type ProductAttributeValueInput = {
  definitionId: number;
  dataType: ProductAttributeDataType;
  valueString?: string | null;
  valueNumber?: number | null;
  valueBool?: boolean | null;
  valueJson?: any | null;
};
