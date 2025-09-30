import React from "react";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { ExpenseDetailForm } from "../forms/ExpenseDetailForm";
import { allExpenseFindFields } from "../forms/expenseDetail";

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
}) {
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      adapter={{
        buildDefaults: buildExpenseDefaults,
        allFields: allExpenseFindFields,
        title: "Find Expenses",
      }}
      FormComponent={ExpenseDetailForm as any}
    />
  );
}
