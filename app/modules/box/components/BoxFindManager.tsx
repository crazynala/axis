import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "@remix-run/react";
import { useFind } from "~/base/find/FindContext";
import { BoxFindModal } from "./BoxFindModal";
import { allBoxFieldConfigs } from "../forms/boxDetail";
import { deriveSemanticKeys } from "~/base/index/indexController";

export function BoxFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [opened, setOpened] = useState(false);
  const semanticKeys = useMemo(
    () => new Set(deriveSemanticKeys(allBoxFieldConfigs)),
    []
  );

  useEffect(
    () => registerFindCallback(() => setOpened(true)),
    [registerFindCallback]
  );

  const initialValues = useMemo(() => {
    const entries = Array.from(sp.entries()).filter(([key]) => key !== "find");
    return Object.fromEntries(entries);
  }, [sp]);

  return (
    <BoxFindModal
      opened={opened}
      onClose={() => setOpened(false)}
      initialValues={initialValues as any}
      onSearch={(qs) => {
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
      }}
    />
  );
}
