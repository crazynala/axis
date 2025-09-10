// app/find/job.search-schema.ts
// Job search schema: mirrors pattern used in product.search-schema (no zod to avoid extra dep)
import type { Prisma } from "@prisma/client";
import type { SearchSchema } from "./findify.types";

export type JobSearchValues = {
  id?: number | string | null;
  projectCode?: string;
  name?: string;
  status?: string;
  jobType?: string;
  endCustomerName?: string;
  companyId?: number | string | null;
};

export const jobSearchSchema: SearchSchema<
  JobSearchValues,
  Prisma.JobWhereInput
> = {
  fields: {
    id: { kind: "id", path: "id" },
    projectCode: {
      kind: "text",
      path: "projectCode",
      op: "contains",
      mode: "insensitive",
    },
    name: { kind: "text", path: "name", op: "contains", mode: "insensitive" },
    status: {
      kind: "text",
      path: "status",
      op: "contains",
      mode: "insensitive",
    },
    jobType: {
      kind: "text",
      path: "jobType",
      op: "contains",
      mode: "insensitive",
    },
    endCustomerName: {
      kind: "text",
      path: "endCustomerName",
      op: "contains",
      mode: "insensitive",
    },
    companyId: { kind: "id", path: "companyId" },
  },
};
