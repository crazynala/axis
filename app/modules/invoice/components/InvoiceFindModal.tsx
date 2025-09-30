import React from "react";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { InvoiceDetailForm } from "../forms/InvoiceDetailForm";
import { allInvoiceFindFields } from "../forms/invoiceDetail";

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
}) {
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      adapter={{
        buildDefaults: buildInvoiceDefaults,
        allFields: allInvoiceFindFields,
        title: "Find Invoices",
      }}
      FormComponent={InvoiceDetailForm as any}
    />
  );
}
