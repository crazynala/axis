// Takes a JSON from client and cleans for Prisma create/update
export function marshallPurchaseOrderToPrisma(purchaseOrder: any) {
  return {
    date: purchaseOrder.date ? new Date(purchaseOrder.date) : null,
    status: purchaseOrder.status || null,
    companyId: purchaseOrder.companyId || null,
    consigneeCompanyId: purchaseOrder.consigneeCompanyId || null,
    locationId: purchaseOrder.locationId || null,
    memo: purchaseOrder.memo || null,
  };
}
