export type AddressLike = {
  name?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLine3?: string | null;
  addressTownCity?: string | null;
  addressCountyState?: string | null;
  addressZipPostCode?: string | null;
  addressCountry?: string | null;
};

export function formatAddressLines(address?: AddressLike | null): string[] {
  if (!address) return [];
  const cityLine = [
    address.addressTownCity,
    address.addressCountyState,
    address.addressZipPostCode,
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    address.name,
    address.addressLine1,
    address.addressLine2,
    address.addressLine3,
    cityLine || null,
    address.addressCountry,
  ].filter(Boolean) as string[];
  return lines;
}
