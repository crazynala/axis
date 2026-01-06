import React from "react";
import { Button } from "@mantine/core";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { ShipmentDetailForm } from "../forms/ShipmentDetailForm";
import { shipmentSpec } from "../spec";
import type { MultiFindState } from "~/base/find/multiFind";

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
  initialMode?: "simple" | "advanced";
  initialMulti?: MultiFindState | null;
  restoreQs?: string | null;
  onRestore?: (qs: string) => void;
}) {
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      initialMode={props.initialMode}
      initialMulti={props.initialMulti}
      headerActions={
        props.onRestore ? (
          <Button
            size="xs"
            variant="subtle"
            disabled={!props.restoreQs}
            onClick={() => {
              if (!props.restoreQs) return;
              props.onRestore?.(props.restoreQs);
            }}
            type="button"
          >
            Restore
          </Button>
        ) : null
      }
      adapter={{
        buildDefaults: buildShipmentDefaults,
        allFields: shipmentSpec.find.buildConfig,
        title: "Find Shipments",
      }}
      FormComponent={ShipmentDetailForm as any}
    />
  );
}
