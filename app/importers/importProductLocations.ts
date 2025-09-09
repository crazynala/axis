import type { ImportResult } from "./utils";

// Placeholder: The schema doesn't have a specific ProductLocation model.
// Historically, this may map to Batch or inventory views. For now, log-only.
export async function importProductLocations(
  rows: any[]
): Promise<ImportResult> {
  return {
    created: 0,
    updated: 0,
    skipped: rows.length,
    errors: [
      { message: "ProductLocations import not implemented; no model mapped." },
    ] as any,
  };
}
