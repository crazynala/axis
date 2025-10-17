import React from "react";
import { JobDetailForm } from "../forms/JobDetailForm";
import * as jobDetail from "../forms/jobDetail";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";

export interface JobFindModalProps {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void; // callback receives query string (without leading ?)
  initialValues?: any; // from URL params
  jobSample?: any; // for layout non-editable fields like id widget (ignored in find)
}

function buildJobFindDefaults() {
  return {
    id: undefined,
    projectCode: "",
    name: "",
    status: "",
    jobType: "",
    endCustomerName: "",
    companyId: undefined,
    assemblySku: "",
    assemblyName: "",
    assemblyStatus: "",
  } as any;
}

export function JobFindModal(props: JobFindModalProps) {
  const allFields = () => [
    ...((jobDetail as any).jobOverviewFields || []),
    ...((jobDetail as any).jobDateStatusLeft || []),
    ...((jobDetail as any).jobDateStatusRight || []),
    ...((jobDetail as any).assemblyFields || []),
  ];
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      adapter={{
        buildDefaults: buildJobFindDefaults,
        allFields,
        title: "Find Jobs",
      }}
      FormComponent={JobDetailForm as any}
    />
  );
}
