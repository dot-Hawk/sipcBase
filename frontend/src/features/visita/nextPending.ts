/**
 * Next producto after `fromId` (in list order, wrapping) that has no price.
 * The current producto is never returned.
 */
export function nextPendingId(
  orderedIds: readonly string[],
  pricedIds: ReadonlySet<string>,
  fromId: string | null,
): string | null {
  const n = orderedIds.length;
  if (n === 0) return null;
  const start = fromId === null ? -1 : orderedIds.indexOf(fromId);
  for (let step = 1; step <= n; step += 1) {
    const id = orderedIds[(start + step + n) % n] as string;
    if (id === fromId) continue;
    if (!pricedIds.has(id)) return id;
  }
  return null;
}
