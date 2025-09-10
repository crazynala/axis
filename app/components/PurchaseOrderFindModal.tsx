import React from "react";
import { GenericMultiFindModal } from "./find/GenericMultiFindModal";
import { PurchaseOrderDetailForm } from "./PurchaseOrderDetailForm";
import { allPurchaseOrderFindFields } from "../formConfigs/purchaseOrderDetail";

function buildPurchaseOrderDefaults() {
  return {
    id: undefined,
    date: "",
    status: "",
    companyId: undefined,
    consigneeCompanyId: undefined,
    locationId: undefined,
    vendorName: "",
    consigneeName: "",
    locationName: "",
  } as any;
}

export function PurchaseOrderFindModal(props: {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void;
  initialValues?: any;
}) {
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      adapter={{
        buildDefaults: buildPurchaseOrderDefaults,
        allFields: allPurchaseOrderFindFields,
        title: "Find Purchase Orders",
      }}
      FormComponent={PurchaseOrderDetailForm as any}
    />
  );
}
