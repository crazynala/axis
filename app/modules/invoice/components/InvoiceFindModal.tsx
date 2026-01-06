import React from "react";
import { Button } from "@mantine/core";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { InvoiceDetailForm } from "../forms/InvoiceDetailForm";
import { invoiceSpec } from "../spec";
import type { MultiFindState } from "~/base/find/multiFind";

function buildInvoiceDefaults() {
  return {
    id: undefined,
    invoiceCode: "",
    date: "",
    status: "",
    companyId: undefined,
    notes: "",
    companyName: "",
  } as any;
}

export function InvoiceFindModal(props: {
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
        buildDefaults: buildInvoiceDefaults,
        allFields: invoiceSpec.find.buildConfig,
        title: "Find Invoices",
      }}
      FormComponent={InvoiceDetailForm as any}
    />
  );
}
