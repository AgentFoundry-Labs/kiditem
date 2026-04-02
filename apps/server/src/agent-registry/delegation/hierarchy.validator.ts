/**
 * Hierarchy validation — pure function.
 * Design Ref: §4.2.1 — reportsTo 관계 검증
 */

export function validateDelegation(
  parent: { id: string; role: string },
  child: { id: string; reportsTo: string | null },
): { valid: boolean; reason?: string } {
  if (parent.id === child.id) {
    return { valid: false, reason: 'self_delegation' };
  }
  if (child.reportsTo !== parent.id) {
    return { valid: false, reason: 'not_subordinate' };
  }
  if (parent.role !== 'manager' && parent.role !== 'operator') {
    return { valid: false, reason: 'insufficient_role' };
  }
  return { valid: true };
}
