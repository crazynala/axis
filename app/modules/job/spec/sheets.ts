import type { ModuleSheetSpec, SheetViewSpec } from "~/base/sheets/sheetSpec";

type JobCostingSheetRow = {
  assemblyName: string;
  productSku: string;
  productName: string;
  activityUsed: string;
  quantityPerUnit: number | string;
  unitCost: number | string;
};

const assemblyCostingsView: SheetViewSpec<JobCostingSheetRow> = {
  id: "assembly-costings",
  label: "Assembly Costings",
  defaultColumns: [
    "assemblyName",
    "productSku",
    "productName",
    "activityUsed",
    "quantityPerUnit",
    "unitCost",
  ],
  columns: [
    { key: "assemblyName", label: "Assembly", hideable: false, section: "base" },
    { key: "productSku", label: "SKU", section: "base" },
    { key: "productName", label: "Name", section: "base" },
    { key: "activityUsed", label: "Usage", section: "base", group: "Usage" },
    { key: "quantityPerUnit", label: "Qty/Unit", section: "base", group: "Usage" },
    { key: "unitCost", label: "Unit Cost", section: "base", group: "Pricing" },
  ],
};

export const jobSheetSpec: ModuleSheetSpec<any> = {
  views: {
    "assembly-costings": assemblyCostingsView,
  },
};
