export type PendingCostingItem = {
  sourceType: "costing";
  costingId: number;
  jobId: number;
  assemblyId: number;
  jobProjectCode?: string | null;
  assemblyName?: string | null;
  costingName?: string | null;
  description: string;
  invoiceCalcDebug?: {
    billUpon: "Ship" | "Make";
    qtyOrdered: number;
    qtyCut: number;
    qtyMake: number;
    qtyPack: number;
    pctCut: number;
    pctOrder: number;
    baseQty: number;
    addFromCut: number;
    minFromOrder: number;
    invoiceable: number;
  };
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
  purchaseOrderId: number | null;
  productName?: string | null;
  quantityOrdered: string;
  quantityReceived: string;
  amountPendingUSD: string;
  unitPrice: string;
  calcDebug?: {
    orderedQuantity: number;
    receivedQuantity: number;
    targetQuantity: number;
    invoicedQuantity: number;
    pendingQuantity: number;
    unitPrice: number;
    pendingAmount: number;
    invoiceLines?: Array<{
      id: number | null | undefined;
      quantity: any;
      priceSell: any;
      invoicedPrice?: any;
      invoicedTotalManual: any;
      category?: string | null;
      subCategory?: string | null;
      computedTotal: number;
    }>;
  };
};

export type PendingExpenseItem = {
  sourceType: "expense";
  expenseId: number;
  amountPendingUSD: string;
  jobProjectCode?: string | null;
};
