import type { BoxDestination } from "~/modules/box/services/boxDestination.server";

type JobShipTo = {
  shipToAddressId?: number | null;
  shipToLocationId?: number | null;
};

type AssemblyShipToOverride = {
  shipToAddressIdOverride?: number | null;
  shipToLocationIdOverride?: number | null;
};

export function resolveEffectiveShipTo(
  job: JobShipTo | null | undefined,
  assembly: AssemblyShipToOverride | null | undefined
): BoxDestination | null {
  const overrideAddress = assembly?.shipToAddressIdOverride ?? null;
  if (overrideAddress != null) {
    return { kind: "address", id: overrideAddress };
  }
  const overrideLocation = assembly?.shipToLocationIdOverride ?? null;
  if (overrideLocation != null) {
    return { kind: "location", id: overrideLocation };
  }
  const jobAddress = job?.shipToAddressId ?? null;
  if (jobAddress != null) {
    return { kind: "address", id: jobAddress };
  }
  const jobLocation = job?.shipToLocationId ?? null;
  if (jobLocation != null) {
    return { kind: "location", id: jobLocation };
  }
  return null;
}
