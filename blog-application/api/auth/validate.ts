export type Fields = Record<string, string>;

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validDisplayName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= 50 ? t : null;
}

export function validBio(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 500 ? v : null;
}
