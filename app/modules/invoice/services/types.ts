export type PendingCostingItem = {
  sourceType: "costing";
  costingId: number;
  jobId: number;
  assemblyId: number;
  jobProjectCode?: string | null;
  description: string;
  maxQuantity: string;
  alreadyInvoicedQty: string;
  defaultQuantity: string;
  defaultUnitPrice: string | null;
};

export type PendingShipmentItem = {
  sourceType: "shipping";
  shipmentId: number;
  trackingNo: string | null;
  freightPendingUSD: string;
  dutyPendingUSD: string;
};

export type PendingPOLineItem = {
  sourceType: "po";
  purchaseOrderLineId: number;
  amountPendingUSD: string;
  unitPrice: string;
};

export type PendingExpenseItem = {
  sourceType: "expense";
  expenseId: number;
  amountPendingUSD: string;
  jobProjectCode?: string | null;
};
