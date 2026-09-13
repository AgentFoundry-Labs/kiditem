/**
 * Sums Rocket PO amounts. A PO with an unconfirmed line has an unknown amount,
 * which makes the total unknown instead of counting it as ₩0.
 */
export function sumRocketOrderAmounts(amounts: Iterable<number | null>): number | null {
  let total = 0;
  for (const amount of amounts) {
    if (amount === null) return null;
    total += amount;
  }
  return total;
}
