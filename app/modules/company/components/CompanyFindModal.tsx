import React from "react";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { CompanyDetailForm } from "../forms/CompanyDetailForm";
import { allCompanyFindFields } from "../forms/companyDetail";

function buildCompanyDefaults() {
  return {
    id: undefined,
    name: "",
    notes: "",
    isCarrier: "",
    isCustomer: "",
    isSupplier: "",
    isInactive: "",
    isActive: "",
  } as any;
}

export function CompanyFindModal(props: {
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
        buildDefaults: buildCompanyDefaults,
        allFields: allCompanyFindFields,
        title: "Find Companies",
      }}
      FormComponent={CompanyDetailForm as any}
    />
  );
}
