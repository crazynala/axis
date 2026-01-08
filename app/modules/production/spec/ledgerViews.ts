const baseColumns = [
  "id",
  "customerName",
  "job",
  "name",
  "assemblyType",
  "primaryCostingName",
  "ordered",
  "cut",
  "sew",
  "finish",
  "pack",
];

export type ProductionLedgerBuiltInView = {
  id: string;
  module: string;
  name: string;
  params: Record<string, any>;
  isGlobal: boolean;
  isLocked: boolean;
  ownerUserId: number | null;
  editable: boolean;
  isBuiltin: true;
};

export const productionLedgerBuiltInViews: ProductionLedgerBuiltInView[] = [
  {
    id: "at-risk",
    module: "production-ledger",
    name: "At Risk",
    params: {
      sort: null,
      dir: null,
      columns: [...baseColumns, "signals", "nextActions"],
    },
    isGlobal: true,
    isLocked: true,
    ownerUserId: null,
    editable: false,
    isBuiltin: true,
  },
  {
    id: "out-at-vendor",
    module: "production-ledger",
    name: "Out at Vendor",
    params: {
      sort: null,
      dir: null,
      columns: [...baseColumns, "externalStep"],
    },
    isGlobal: true,
    isLocked: true,
    ownerUserId: null,
    editable: false,
    isBuiltin: true,
  },
  {
    id: "needs-action",
    module: "production-ledger",
    name: "Needs Action",
    params: {
      sort: null,
      dir: null,
      columns: [...baseColumns, "nextActions"],
    },
    isGlobal: true,
    isLocked: true,
    ownerUserId: null,
    editable: false,
    isBuiltin: true,
  },
  {
    id: "materials-short",
    module: "production-ledger",
    name: "Materials Short",
    params: {
      sort: null,
      dir: null,
      columns: [...baseColumns, "materialsShort"],
    },
    isGlobal: true,
    isLocked: true,
    ownerUserId: null,
    editable: false,
    isBuiltin: true,
  },
];

export function findBuiltInProductionLedgerView(viewId: string | null) {
  if (!viewId) return null;
  return (
    productionLedgerBuiltInViews.find((view) => view.id === viewId) || null
  );
}
