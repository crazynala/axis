import React from "react";
import { Button } from "@mantine/core";
import { JobDetailForm } from "../forms/JobDetailForm";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { jobSpec } from "../spec";
import type { MultiFindState } from "~/base/find/multiFind";

export interface JobFindModalProps {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void; // callback receives query string (without leading ?)
  initialValues?: any; // from URL params
  initialMode?: "simple" | "advanced";
  initialMulti?: MultiFindState | null;
  restoreQs?: string | null;
  onRestore?: (qs: string) => void;
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
        buildDefaults: buildJobFindDefaults,
        allFields: jobSpec.find.buildConfig,
        title: "Find Jobs",
      }}
      FormComponent={JobDetailForm as any}
    />
  );
}
