import { buildJobWarnings } from "../spec/warnings";

type JobRow = {
  _count?: { assemblies?: number | null } | null;
  [key: string]: any;
};

export function hydrateJobRows(rows: JobRow[]) {
  return rows.map((row) => {
    const { _count, ...rest } = row || {};
    return {
      ...rest,
      warnings: buildJobWarnings({
        assemblyCount: _count?.assemblies ?? 0,
        companyId: row?.companyId ?? null,
      }),
    };
  });
}
