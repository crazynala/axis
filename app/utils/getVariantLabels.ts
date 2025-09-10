// Utility to derive effective variant labels respecting c_numVariants and trimming trailing blanks.
export function getVariantLabels(
  sourceVariants: string[] | undefined | null,
  c_numVariants?: number | null
): string[] {
  const raw = Array.isArray(sourceVariants) ? sourceVariants : [];
  // find last non-empty
  let last = -1;
  for (let i = raw.length - 1; i >= 0; i--) {
    if ((raw[i] || "").toString().trim()) {
      last = i;
      break;
    }
  }
  const maxFromContent = last + 1;
  const limit =
    typeof c_numVariants === "number" && c_numVariants > 0
      ? c_numVariants
      : raw.length;
  const effectiveLen = Math.max(0, Math.min(limit, maxFromContent));
  return raw.slice(0, effectiveLen);
}
