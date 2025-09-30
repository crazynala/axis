import React from "react";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { ShipmentDetailForm } from "../forms/ShipmentDetailForm";
import { allShipmentFindFields } from "../forms/shipmentDetail";

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
