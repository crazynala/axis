// route-spec v1.1 extracted constants
// Update the version here when modifying route-spec.md and audit usages.

export const JOB_DATES_STATUS_FIELDS = [
  "customerOrderDate",
  "targetDate",
  "dropDeadDate",
  "startDate",
  "endDate",
  "jobType",
  "status",
  "type",
  "endCustomerName",
  "customerPoNum",
] as const;

export type JobDatesStatusField = (typeof JOB_DATES_STATUS_FIELDS)[number];

export const JOB_OVERVIEW_FIELDS = [
  "projectCode",
  "name",
  "companyId",
] as const;

export const ASSEMBLY_QUANTITY_ROWS = [
  "Ordered",
  "Cut",
  "Make",
  "Pack",
] as const;

// Product spec (detail minimal core + stock/movement expected labels)
export const PRODUCT_DETAIL_CORE_FIELDS = [
  "sku",
  "name",
  "type",
  "stockTrackingEnabled",
  "batchTrackingEnabled",
  "costPrice",
  "manualSalePrice",
] as const;

// Invoice detail editable fields
export const INVOICE_DETAIL_FIELDS = [
  "code",
  "date",
  "status",
  "notes",
  "companyId",
] as const;

// Purchase Order detail editable fields
export const PURCHASE_ORDER_DETAIL_FIELDS = ["date", "status"] as const;

export type ProductDetailField = (typeof PRODUCT_DETAIL_CORE_FIELDS)[number];
export type InvoiceDetailField = (typeof INVOICE_DETAIL_FIELDS)[number];
export type PurchaseOrderDetailField =
  (typeof PURCHASE_ORDER_DETAIL_FIELDS)[number];
