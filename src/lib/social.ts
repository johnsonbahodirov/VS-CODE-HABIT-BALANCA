export function normalizeFriendCode(value: string): string | null {
  const code = value.trim();
  return /^\d{6}$/.test(code) ? code : null;
}
