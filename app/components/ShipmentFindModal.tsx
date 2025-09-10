import React from "react";
import { GenericMultiFindModal } from "./find/GenericMultiFindModal";
import { ShipmentDetailForm } from "./ShipmentDetailForm";
import { allShipmentFindFields } from "../formConfigs/shipmentDetail";

function buildShipmentDefaults() {
  return {
    id: undefined,
    date: "",
    dateReceived: "",
    type: "",
    shipmentType: "",
    status: "",
    trackingNo: "",
    packingSlipCode: "",
    carrierName: "",
    senderName: "",
    receiverName: "",
    locationName: "",
  } as any;
}

export function ShipmentFindModal(props: {
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
        buildDefaults: buildShipmentDefaults,
        allFields: allShipmentFindFields,
        title: "Find Shipments",
      }}
      FormComponent={ShipmentDetailForm as any}
    />
  );
}
