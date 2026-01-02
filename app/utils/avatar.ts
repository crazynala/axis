type InitialsInput = {
  name?: string;
  firstName?: string;
  lastName?: string;
};

export function getInitials(input: InitialsInput) {
  const first = (input.firstName || "").trim();
  const last = (input.lastName || "").trim();
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  const name = (input.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0]?.[0]?.toUpperCase() ?? null;
  }
  if (first) return first[0].toUpperCase();
  if (last) return last[0].toUpperCase();
  return null;
}
