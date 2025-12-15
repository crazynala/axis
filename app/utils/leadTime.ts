export type LeadTimeContext = {
  costing?: { leadTimeDays?: number | null } | null;
  product?: { leadTimeDays?: number | null } | null;
  company?: { defaultLeadTimeDays?: number | null } | null;
};

export type LeadTimeSource = "costing" | "product" | "company";

export type LeadTimeResolution = {
  value: number | null;
  source: LeadTimeSource | null;
};

export function resolveLeadTimeDetail(
  context: LeadTimeContext
): LeadTimeResolution {
  const { costing, product, company } = context || {};
  const candidates: Array<{ source: LeadTimeSource; value?: number | null }> = [
    { source: "costing", value: costing?.leadTimeDays },
    { source: "product", value: product?.leadTimeDays },
    { source: "company", value: company?.defaultLeadTimeDays },
  ];
  for (const candidate of candidates) {
    if (candidate.value == null) continue;
    const n = Number(candidate.value);
    if (Number.isFinite(n) && n > 0) {
      return { value: n, source: candidate.source };
    }
  }
  return { value: null, source: null };
}

export function resolveLeadTimeDays(context: LeadTimeContext): number | null {
  return resolveLeadTimeDetail(context).value;
}
