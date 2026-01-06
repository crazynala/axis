import React from "react";
import { Button } from "@mantine/core";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { ExpenseDetailForm } from "../forms/ExpenseDetailForm";
import { expenseSpec } from "../spec";
import type { MultiFindState } from "~/base/find/multiFind";

function buildExpenseDefaults() {
  return {
    id: undefined,
    date: "",
    category: "",
    details: "",
    memo: "",
    priceCostMin: undefined,
    priceCostMax: undefined,
    priceSellMin: undefined,
    priceSellMax: undefined,
  } as any;
}

export function ExpenseFindModal(props: {
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
        buildDefaults: buildExpenseDefaults,
        allFields: expenseSpec.find.buildConfig,
        title: "Find Expenses",
      }}
      FormComponent={ExpenseDetailForm as any}
    />
  );
}
