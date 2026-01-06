export type ProductDetailVM = {
  product: any;
  effectivePricingModel?: string | null;
  pricingModelLabel?: string | null;
  metadataDefinitions: any[];
  metadataValuesByKey: Record<string, any>;
  stockByLocation: any[];
  stockByBatch: any[];
  productChoices: any[];
  movements: any[];
  movementHeaders: any[];
  locationNameById: Record<number, string>;
  salePriceGroups: any[];
  usedInProducts: any[];
  costingAssemblies: any[];
  hasCmtLine?: boolean;
  pricingSpecOptions?: Array<{ value: string; label: string }>;
  pricingSpecRangesById?: Record<
    string,
    Array<{
      id: number;
      rangeFrom: number | null;
      rangeTo: number | null;
      multiplier: string;
    }>
  >;
  categoryLabel?: string | null;
  subCategoryLabel?: string | null;
  subCategoryOptions?: Array<{ value: string; label: string }>;
  userLevel: string | null;
  canDebug: boolean;
};
