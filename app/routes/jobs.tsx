import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { MasterTableProvider } from "@aa/timber";
import { jobSearchSchema } from "../find/job.search-schema";
import { buildWhere } from "../find/buildWhere";

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const findFlag = url.searchParams.get("find");
  let where: any = undefined;
  if (findFlag) {
    const values: any = {};
    const pass = (k: string) => {
      const v = url.searchParams.get(k);
      if (v !== null && v !== "") values[k] = v;
    };
    [
      "id",
      "projectCode",
      "name",
      "status",
      "jobType",
      "endCustomerName",
      "companyId",
    ].forEach(pass);
    where = buildWhere(values, jobSearchSchema);
  }
  const jobs = await prisma.job.findMany({
    where,
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      projectCode: true,
      company: { select: { name: true } },
    },
  });
  return json({ jobs });
}

export default function JobsLayout() {
  const data = useLoaderData() as { jobs?: any[] };

  return (
    <MasterTableProvider initialRecords={data.jobs}>
      <Outlet />
    </MasterTableProvider>
  );
}
