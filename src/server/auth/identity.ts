export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;

export const normalizeUsername = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH);

export const isValidUsername = (value: string): boolean =>
  USERNAME_PATTERN.test(value.trim().toLowerCase());

export const isPlaceholderPrivyUsername = (value: string | null | undefined): boolean => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized.startsWith("privy_") || normalized.startsWith("privy-");
};

export const normalizeDisplayName = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const isPlaceholderDisplayName = (value: string | null | undefined): boolean => {
  const normalized = normalizeDisplayName(String(value ?? "")).toLowerCase();
  if (!normalized) return true;
  return normalized.startsWith("privy_") || normalized.startsWith("privy-");
};
