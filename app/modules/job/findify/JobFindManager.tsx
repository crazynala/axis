import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { useFind } from "~/base/find/FindContext";
import { JobFindModal } from "../components/JobFindModal";
import * as jobDetail from "../forms/jobDetail";
import { deriveSemanticKeys } from "~/base/index/indexController";

/**
 * Encapsulates job find modal lifecycle.
 * - Registers a trigger with FindContext so GlobalFindTrigger / Cmd+F can open it
 * - Syncs initial open state with ?find=1 (optional backwards compat)
 * - Emits onSearch navigation when user submits criteria
 */
export function JobFindManager({ jobSample }: { jobSample?: any }) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [open, setOpen] = useState(false);
  const semanticKeys = useMemo(() => {
    const allFields = [
      ...((jobDetail as any).jobOverviewFields || []),
      ...((jobDetail as any).jobDateStatusLeft || []),
      ...((jobDetail as any).jobDateStatusRight || []),
      ...((jobDetail as any).assemblyFields || []),
    ];
    return new Set(deriveSemanticKeys(allFields));
  }, []);

  // Register callback so global find can invoke
  useEffect(
    () => registerFindCallback(() => setOpen(true)),
    [registerFindCallback]
  );

  return (
    <JobFindModal
      opened={open}
      onClose={() => {
        setOpen(false);
      }}
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
        setOpen(false);
        navigate(url.pathname + "?" + url.searchParams.toString());
      }}
      initialValues={Object.fromEntries(Array.from(sp.entries()))}
      jobSample={jobSample}
    />
  );
}
