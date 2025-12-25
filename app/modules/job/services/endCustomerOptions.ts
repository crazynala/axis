export type EndCustomerContact = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  companyId?: number | null;
};

export function buildEndCustomerOptions(
  contacts: EndCustomerContact[] | null | undefined,
  companyId: number | null | undefined
): { value: string; label: string }[] {
  const cid = companyId != null ? Number(companyId) : null;
  if (!cid || !Array.isArray(contacts)) return [];
  return contacts
    .filter((c) => Number(c.companyId) === cid)
    .map((c) => {
      const value = c?.id != null ? String(c.id) : "";
      if (!value) return null;
      const label =
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        `Contact ${value}`;
      return { value, label };
    })
    .filter(Boolean) as { value: string; label: string }[];
}
