export function isCompanyImmutableViolation(args: {
  existingCompanyId: number | null | undefined;
  nextCompanyId: number | null | undefined;
}): boolean {
  if (args.existingCompanyId == null && args.nextCompanyId == null) return false;
  return args.nextCompanyId !== args.existingCompanyId;
}
