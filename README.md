---
title: Server Rendering
toc: false
---

# ERP Remix

Run dev:

```
npm run dev
```

Build:

```
npm run build
```

## Import mappings

The Admin → Import supports Excel files with FileMaker field names. The following mappings are implemented:

- Invoices (import:invoices)

  - a_CompanyID → Invoice.companyId
  - InvoiceNo/InvoiceCode → Invoice.invoiceCode
  - Date → Invoice.date

- Invoice Lines (import:invoice_lines)

  - a_CostingID → InvoiceLine.costingId
  - a_ExpenseID → InvoiceLine.expenseId
  - a_InvoiceID → InvoiceLine.invoiceId
  - a_JobNo → InvoiceLine.jobId
  - a_PurchaseOrderLineID → InvoiceLine.purchaseOrderLineId
  - a_ShippingID|Actual → InvoiceLine.shippingIdActual
  - a_ShippingID|Duty → InvoiceLine.shippingIdDuty
  - a_TaxCodeID → InvoiceLine.taxCodeId
  - Plus common fields: Details, Category, SubCategory, PriceCost, PriceSell, Quantity, TaxRateCost, InvoicedTotalManual

- Purchase Orders (import:purchase_orders)

  - a_CompanyID → PurchaseOrder.companyId
  - a_CompanyID|Consignee → PurchaseOrder.consigneeCompanyId
  - a_LocationID|In → PurchaseOrder.locationId
  - Date → PurchaseOrder.date

- Purchase Order Lines (import:purchase_order_lines)
  - a_AssemblyID → PurchaseOrderLine.assemblyId
  - a_JobNo → PurchaseOrderLine.jobId
  - a_PurchaseOrderID → PurchaseOrderLine.purchaseOrderId
  - TaxCode → PurchaseOrderLine.taxCode (string)
  - Plus common fields: product id/sku, priceCost, priceSell, qtyShipped, qtyReceived, quantity, quantityOrdered, taxRate

IDs are treated as FileMaker serials (a\_\_Serial) when present and upserted.

## Find Architecture (Overview)

Unified, FileMaker‑style find system:

- Global hotkey triggers context-registered callback (FindContext + FindManagers).
- Shared DetailForm components (e.g., `JobDetailForm`, `ProductDetailForm`) render edit & find modes via FieldConfig metadata.
- Simple queries: individual URL params (e.g., `sku=ABC`).
- Multi-request (advanced) queries: base64 JSON stack in `findReqs` enabling (A OR B) minus (C) semantics using omit flag.
- Saved Views (extension) store both simple params and `findReqs`.

See `docs/find-pattern.md` for complete details.
