export type ProductDetailVM = {
  product: any;
  stockByLocation: any[];
  stockByBatch: any[];
  productChoices: any[];
  movements: any[];
  movementHeaders: any[];
  locationNameById: Record<number, string>;
  salePriceGroups: any[];
  usedInProducts: any[];
  costingAssemblies: any[];
  userLevel: string | null;
  canDebug: boolean;
};

