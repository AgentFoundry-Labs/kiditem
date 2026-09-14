export type SortDirection = 'asc' | 'desc';

/**
 * Orders two values that may be unavailable. Measured values follow the
 * direction; an unavailable value has no place on the scale, so it sorts last
 * in both directions instead of being ranked as if it were zero.
 */
export function compareNullableLast(
  left: number | null,
  right: number | null,
  direction: SortDirection,
): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === 'asc' ? left - right : right - left;
}
