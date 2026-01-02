import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { ExpenseFindModal } from "../components/ExpenseFindModal";
import { useFind } from "~/base/find/FindContext";
import { allExpenseFindFields } from "../forms/expenseDetail";
import { deriveSemanticKeys } from "~/base/index/indexController";

export function ExpenseFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [opened, setOpened] = useState(false);
  const semanticKeys = React.useMemo(
    () => new Set(deriveSemanticKeys(allExpenseFindFields())),
    []
  );

  useEffect(
    () => registerFindCallback(() => setOpened(true)),
    [registerFindCallback]
  );

  const close = () => {
    setOpened(false);
    const next = new URLSearchParams(sp);
    next.delete("findMode");
    navigate(`?${next.toString()}`);
  };

  const onSearch = (qs: string) => {
    const url = new URL(window.location.href);
    const produced = new URLSearchParams(qs);
    const viewName = url.searchParams.get("view");
    Array.from(url.searchParams.keys()).forEach((k) => {
      if (k === "q" || k === "findReqs" || semanticKeys.has(k))
        url.searchParams.delete(k);
    });
    for (const [k, v] of produced.entries()) url.searchParams.set(k, v);
    url.searchParams.delete("page");
    url.searchParams.delete("findMode");
    if (viewName) {
      url.searchParams.delete("view");
      url.searchParams.set("lastView", viewName);
    }
    setOpened(false);
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  return (
    <ExpenseFindModal
      opened={opened}
      onClose={() => setOpened(false)}
      onSearch={onSearch}
    />
  );
}
