import React from "react";
import { Button } from "@mantine/core";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { PurchaseOrderDetailForm } from "../forms/PurchaseOrderDetailForm";
import { purchaseOrderSpec } from "../spec";
import type { MultiFindState } from "~/base/find/multiFind";

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
        buildDefaults: buildPurchaseOrderDefaults,
        allFields: purchaseOrderSpec.find.buildConfig,
        title: "Find Purchase Orders",
      }}
      FormComponent={PurchaseOrderDetailForm as any}
    />
  );
}
