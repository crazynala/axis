import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { useFind } from "../find/FindContext";
import { JobFindModal } from "./JobFindModal";

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
        setOpen(false);
        navigate(`/jobs?${qs}`);
      }}
      initialValues={Object.fromEntries(Array.from(sp.entries()))}
      jobSample={jobSample}
    />
  );
}
