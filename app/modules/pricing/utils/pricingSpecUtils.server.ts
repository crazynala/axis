import { randomUUID } from "crypto";

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

export function makePricingSpecCode(name?: string | null) {
  const base = slugify(name || "pricing-spec");
  const suffix = randomUUID().slice(0, 8);
  return base ? `${base}-${suffix}` : `pricing-spec-${suffix}`;
}

export function normalizePricingSpecName(name: unknown) {
  return typeof name === "string" ? name.trim() : "";
}
