export type ProductAttributeDataType =
  | "STRING"
  | "NUMBER"
  | "ENUM"
  | "BOOLEAN"
  | "JSON";

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
  sortOrder: number;
};

export type ProductAttributeValueInput = {
  definitionId: number;
  dataType: ProductAttributeDataType;
  valueString?: string | null;
  valueNumber?: number | null;
  valueBool?: boolean | null;
  valueJson?: any | null;
};
