import { useCallback } from "react";
import type { JobSearchValues } from "./job.search-schema";
import { useBaseFindify } from "./baseFindify";
import { useFind } from "./FindContext";

export type JobFindFormValues = JobSearchValues;

function buildJobEditDefaults(job: any): JobFindFormValues {
  return {
    id: job.id,
    projectCode: job.projectCode || "",
    name: job.name || "",
    status: job.status || "",
    jobType: job.jobType || "",
    endCustomerName: job.endCustomerName || "",
    companyId: job.companyId ?? job.company?.id ?? undefined,
  } as any;
}
function buildJobFindDefaults(): JobFindFormValues {
  return {
    id: undefined,
    projectCode: "",
    name: "",
    status: "",
    jobType: "",
    endCustomerName: "",
    companyId: undefined,
  } as any;
}

export function useJobFindify(job: any, nav?: { state: string }) {
  const { mode } = useFind();
  const { editForm, findForm, enterFind, exitFind, toggleFind } =
    useBaseFindify<JobFindFormValues, JobFindFormValues>({
      buildEditDefaults: buildJobEditDefaults,
      buildFindDefaults: buildJobFindDefaults,
      record: job,
      navState: nav?.state,
    });

  const buildUpdatePayload = useCallback((values: JobFindFormValues) => {
    const fd = new FormData();
    fd.set("_intent", "job.update");
    if (values.projectCode) fd.set("projectCode", values.projectCode);
    if (values.name) fd.set("name", values.name);
    if (values.status) fd.set("status", values.status);
    if (values.jobType) fd.set("jobType", values.jobType);
    if (values.endCustomerName)
      fd.set("endCustomerName", values.endCustomerName);
    if (values.companyId != null && values.companyId !== "")
      fd.set("companyId", String(values.companyId));
    return fd;
  }, []);

  const buildFindPayload = useCallback((values: JobFindFormValues) => {
    const fd = new FormData();
    fd.set("_intent", "find");
    const put = (k: string, val: any) => {
      if (val === undefined || val === null || val === "") return;
      fd.set(k, String(val));
    };
    put("id", values.id);
    put("projectCode", values.projectCode);
    put("name", values.name);
    put("status", values.status);
    put("jobType", values.jobType);
    put("endCustomerName", values.endCustomerName);
    put("companyId", values.companyId);
    // propagate return param if present in location
    try {
      const usp = new URLSearchParams(window.location.search);
      const ret = usp.get("return");
      if (ret) fd.set("return", ret);
    } catch {}
    return fd;
  }, []);

  const activeForm = mode === "find" ? findForm : editForm;
  return {
    editForm,
    findForm,
    activeForm,
    mode,
    enterFind,
    exitFind,
    toggleFind,
    buildUpdatePayload,
    buildFindPayload,
  };
}
