import { ApiError } from '../errors';

/** undefined -> 1; otherwise must be a string of digits >= 1 (arrays/objects/"0"/"-1"/"1.5" -> 400). */
export function parsePage(query: { page?: unknown }): number {
  const raw = query?.page;
  if (raw === undefined) return 1;
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw ApiError.validation({ page: 'Must be an integer >= 1' });
  return n;
}
