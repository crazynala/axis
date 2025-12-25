export type JobTypeOption = { value: string; label: string };

export function getDefaultJobTypeValue(
  options: JobTypeOption[] | null | undefined
): string {
  const list = Array.isArray(options) ? options : [];
  const match = list.find(
    (opt) =>
      opt.value === "Production" ||
      (opt.label || "").toLowerCase() === "production"
  );
  if (match?.value) return match.value;
  return list[0]?.value || "Production";
}
