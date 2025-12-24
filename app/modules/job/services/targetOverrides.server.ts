import type { FieldSource } from "~/modules/job/services/targetOverrides.shared";
import { formatSourceChip } from "~/modules/job/services/targetOverrides.shared";

export const DEFAULT_INTERNAL_TARGET_LEAD_DAYS_KEY =
  "defaultInternalTargetLeadDays";
export const DEFAULT_INTERNAL_TARGET_LEAD_DAYS_FALLBACK = 28;

export type { FieldSource };
export { formatSourceChip };

export type LocationRef = { id: number; name: string | null };
export type AddressRef = {
  id: number;
  name: string | null;
  addressLine1?: string | null;
  addressTownCity?: string | null;
  addressCountyState?: string | null;
  addressZipPostCode?: string | null;
  addressCountry?: string | null;
};

export type ResolvedField<T> = {
  value: T | null;
  source: FieldSource;
  jobValue?: T | null;
  overrideValue?: T | null;
};

export type ResolveAssemblyTargetsArgs = {
  job: {
    createdAt?: Date | string | null;
    internalTargetDate?: Date | string | null;
    customerTargetDate?: Date | string | null;
    dropDeadDate?: Date | string | null;
    shipToLocation?: LocationRef | null;
    shipToAddress?: AddressRef | null;
  } | null;
  assembly: {
    internalTargetDateOverride?: Date | string | null;
    customerTargetDateOverride?: Date | string | null;
    dropDeadDateOverride?: Date | string | null;
    shipToLocationOverride?: LocationRef | null;
    shipToAddressOverride?: AddressRef | null;
  } | null;
  defaultLeadDays: number;
  now?: Date;
};

export function resolveAssemblyTargets(args: ResolveAssemblyTargetsArgs) {
  const now = args.now ?? new Date();
  const job = args.job ?? null;
  const assembly = args.assembly ?? null;

  const internalOverride = toDate(assembly?.internalTargetDateOverride);
  const customerOverride = toDate(assembly?.customerTargetDateOverride);
  const dropDeadOverride = toDate(assembly?.dropDeadDateOverride);
  const shipToOverride = assembly?.shipToLocationOverride ?? null;
  const shipToAddressOverride = assembly?.shipToAddressOverride ?? null;

  const jobInternal = toDate(job?.internalTargetDate);
  const jobCustomer = toDate(job?.customerTargetDate);
  const jobDropDead = toDate(job?.dropDeadDate);
  const jobShipTo = job?.shipToLocation ?? null;
  const jobShipToAddress = job?.shipToAddress ?? null;

  const derivedInternal = jobInternal
    ? null
    : deriveInternalFromJobCreatedAt(job?.createdAt, args.defaultLeadDays, now);
  const derivedCustomer = jobCustomer
    ? null
    : deriveInternalFromJobCreatedAt(job?.createdAt, args.defaultLeadDays, now);

  const internalCandidate =
    internalOverride ??
    jobInternal ??
    derivedInternal ??
    null;
  const internalSource: FieldSource = internalOverride
    ? "OVERRIDE"
    : jobInternal
      ? "JOB"
      : derivedInternal
        ? "DERIVED"
        : "NONE";

  const customerCandidate =
    customerOverride ?? jobCustomer ?? derivedCustomer ?? null;
  const customerSource: FieldSource = customerOverride
    ? "OVERRIDE"
    : jobCustomer
      ? "JOB"
      : derivedCustomer
        ? "DERIVED"
        : "NONE";

  let internal = internalCandidate;
  let internalWasClamped = false;
  if (internalCandidate && customerCandidate && internalCandidate > customerCandidate) {
    internal = customerCandidate;
    internalWasClamped = true;
  }

  const dropDead =
    dropDeadOverride ?? jobDropDead ?? null;
  const dropDeadSource: FieldSource = dropDeadOverride
    ? "OVERRIDE"
    : jobDropDead
      ? "JOB"
      : "NONE";

  const legacyShipToLocation =
    shipToOverride ?? jobShipTo ?? null;
  const legacyShipToLocationSource: FieldSource = shipToOverride
    ? "OVERRIDE"
    : jobShipTo
      ? "JOB"
      : "NONE";
  const shipToAddress =
    shipToAddressOverride ?? jobShipToAddress ?? null;
  const shipToAddressSource: FieldSource = shipToAddressOverride
    ? "OVERRIDE"
    : jobShipToAddress
      ? "JOB"
      : "NONE";

  const anyOverride = Boolean(
    internalOverride ||
    customerOverride ||
    dropDeadOverride ||
    shipToOverride ||
    shipToAddressOverride
  );

  return {
    internal: {
      value: internal,
      source: internalSource,
      jobValue: jobInternal ?? derivedInternal ?? null,
      overrideValue: internalOverride ?? null,
    },
    customer: {
      value: customerCandidate,
      source: customerSource,
      jobValue: jobCustomer ?? derivedCustomer ?? null,
      overrideValue: customerOverride ?? null,
    },
    dropDead: {
      value: dropDead,
      source: dropDeadSource,
      jobValue: jobDropDead ?? null,
      overrideValue: dropDeadOverride ?? null,
    },
    shipTo: {
      value: null,
      source: "NONE" as FieldSource,
      jobValue: null,
      overrideValue: null,
    },
    legacyShipToLocation: {
      value: legacyShipToLocation,
      source: legacyShipToLocationSource,
      jobValue: jobShipTo ?? null,
      overrideValue: shipToOverride ?? null,
    },
    shipToAddress: {
      value: shipToAddress,
      source: shipToAddressSource,
      jobValue: jobShipToAddress ?? null,
      overrideValue: shipToAddressOverride ?? null,
    },
    internalSource,
    customerSource,
    internalWasClamped,
    anyOverride,
  };
}

export async function loadDefaultInternalTargetLeadDays(prisma: {
  setting: { findUnique: (args: { where: { key: string } }) => Promise<any> };
}): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: DEFAULT_INTERNAL_TARGET_LEAD_DAYS_KEY },
  });
  if (setting?.number != null) return Number(setting.number);
  if (setting?.value != null) {
    const parsed = Number(setting.value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_INTERNAL_TARGET_LEAD_DAYS_FALLBACK;
}

export function deriveInternalFromJobCreatedAt(
  createdAt: Date | string | null | undefined,
  leadDays: number,
  now: Date
): Date | null {
  const base = toDate(createdAt) ?? now;
  if (!Number.isFinite(base.getTime())) return null;
  const days = Number.isFinite(leadDays) ? leadDays : DEFAULT_INTERNAL_TARGET_LEAD_DAYS_FALLBACK;
  return new Date(base.getTime() + Math.max(0, Math.floor(days)) * 86400000);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}
