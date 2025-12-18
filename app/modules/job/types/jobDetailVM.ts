export type JobDetailVM = {
  job: any;
  productsById: Record<number, any>;
  assemblyTypes: Array<{ label: string }>;
  customers: Array<{ id: number; name: string | null }>;
  productChoices: any[];
  groupsById: Record<number, any>;
  activityCounts: Record<number, number>;
};

