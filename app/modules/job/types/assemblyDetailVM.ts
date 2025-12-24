export type AssemblyDetailVM = {
  job: { id: number; name: string | null } | null;
  assemblies: any[];
  quantityItems: any[];
  costingStats: Record<number, { allStock: number; locStock: number; used: number }>;
  activities: any[];
  activityConsumptionMap:
    | Record<number, Record<number, Record<number, number>>>
    | undefined;
  products: Array<{ id: number; sku: string | null; name: string | null }> | undefined;
  productVariantSet:
    | { id: number; name: string | null; variants: string[] }
    | null
    | undefined;
  packContext: {
    openBoxes: any[];
    stockLocation: { id: number; name: string | null } | null;
  };
  packActivityReferences:
    | Record<
        number,
        {
          kind: "shipment";
          shipmentLineId: number;
          shipmentId: number | null;
          trackingNo?: string | null;
          packingSlipCode?: string | null;
          shipmentType?: string | null;
        }
      >
    | null;
  assemblyTypes: Array<{ label: string }>;
  defectReasons: Array<{ id: number; label: string }>;
  groupInfo: any | null;
  primaryCostingIdByAssembly: Record<number, number | null>;
  toleranceDefaults: any;
  rollupsByAssembly: Record<number, any>;
  vendorOptionsByStep: any;
  materialCoverageByAssembly: Array<{ assemblyId: number; coverage: any | null }>;
  locations: Array<{ id: number; name: string | null }>;
  shipToAddresses: Array<{
    id: number;
    name: string | null;
    addressLine1: string | null;
    addressTownCity: string | null;
    addressCountyState: string | null;
    addressZipPostCode: string | null;
    addressCountry: string | null;
  }>;
  defaultLeadDays: number;
  assemblyTargetsById: Record<number, any>;
  canDebug: boolean;
};
