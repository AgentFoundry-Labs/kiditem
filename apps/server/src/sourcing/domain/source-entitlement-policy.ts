export const SOURCE_ENTITLEMENT_LIFECYCLES = [
  'proposed',
  'onboarding',
  'shadow',
  'qualified',
  'suspended',
] as const;

export type SourceEntitlementLifecycle =
  (typeof SOURCE_ENTITLEMENT_LIFECYCLES)[number];

export const SOURCE_ENTITLEMENT_DECISION_IMPACTS = [
  'disabled',
  'enabled',
] as const;

export type SourceEntitlementDecisionImpact =
  (typeof SOURCE_ENTITLEMENT_DECISION_IMPACTS)[number];

export const SOURCE_ENTITLEMENT_OPERATIONS = [
  'collect',
  'score',
  'train',
  'retain',
] as const;

export type SourceEntitlementOperation =
  (typeof SOURCE_ENTITLEMENT_OPERATIONS)[number];

export type SourceEntitlementDenialReason =
  | 'kill_switch_enabled'
  | 'invalid_permission_start'
  | 'permission_not_started'
  | 'invalid_permission_expiry'
  | 'permission_expired'
  | 'lifecycle_proposed'
  | 'lifecycle_suspended'
  | 'lifecycle_not_qualified'
  | 'decision_impact_disabled';

export interface SourceEntitlementPolicyInput {
  lifecycle: SourceEntitlementLifecycle;
  decisionImpact: SourceEntitlementDecisionImpact;
  operation: SourceEntitlementOperation;
  killSwitch: boolean;
  permissionStartsAt?: Date | string | null;
  permissionExpiresAt?: Date | string | null;
  at?: Date;
}

export type SourceEntitlementPolicyResult =
  | { allowed: true; reason: null }
  | { allowed: false; reason: SourceEntitlementDenialReason };

export interface SourceEntitlementVersionInput {
  lifecycle: SourceEntitlementLifecycle;
  decisionImpact: SourceEntitlementDecisionImpact;
  killSwitch: boolean;
}

export type SourceEntitlementVersionViolation =
  | 'decision_impact_requires_qualified_lifecycle'
  | 'kill_switch_conflicts_with_enabled_impact';

export type SourceEntitlementVersionValidation =
  | { valid: true; violations: [] }
  | {
      valid: false;
      violations: SourceEntitlementVersionViolation[];
    };

/**
 * Decide whether one persisted entitlement version may be used for one
 * operation. Collection and retention are deliberately separate from decision
 * impact: onboarding/shadow evidence may be observed, but it cannot affect a
 * score or a training set.
 */
export function evaluateSourceEntitlement(
  input: SourceEntitlementPolicyInput,
): SourceEntitlementPolicyResult {
  if (input.killSwitch) {
    return denied('kill_switch_enabled');
  }

  const start = permissionDate(input.permissionStartsAt);
  if (start === 'invalid') {
    return denied('invalid_permission_start');
  }
  const expiry = permissionDate(input.permissionExpiresAt);
  if (expiry === 'invalid') {
    return denied('invalid_permission_expiry');
  }
  const at = input.at ?? new Date();
  if (!Number.isFinite(at.getTime())) {
    throw new TypeError('Source entitlement evaluation time must be valid.');
  }
  if (start && at.getTime() < start.getTime()) {
    return denied('permission_not_started');
  }
  if (expiry && at.getTime() >= expiry.getTime()) {
    return denied('permission_expired');
  }

  if (input.lifecycle === 'suspended') {
    return denied('lifecycle_suspended');
  }
  if (input.lifecycle === 'proposed') {
    return denied('lifecycle_proposed');
  }

  if (input.operation === 'collect' || input.operation === 'retain') {
    return { allowed: true, reason: null };
  }

  if (input.lifecycle !== 'qualified') {
    return denied('lifecycle_not_qualified');
  }
  if (input.decisionImpact !== 'enabled') {
    return denied('decision_impact_disabled');
  }

  return { allowed: true, reason: null };
}

/**
 * Validate a proposed entitlement version before it is persisted. This stays
 * framework-free so HTTP, workflow, and migration callers share one rule.
 */
export function validateSourceEntitlementVersion(
  input: SourceEntitlementVersionInput,
): SourceEntitlementVersionValidation {
  const violations: SourceEntitlementVersionViolation[] = [];

  if (
    input.decisionImpact === 'enabled' &&
    input.lifecycle !== 'qualified'
  ) {
    violations.push('decision_impact_requires_qualified_lifecycle');
  }
  if (input.killSwitch && input.decisionImpact === 'enabled') {
    violations.push('kill_switch_conflicts_with_enabled_impact');
  }

  return violations.length === 0
    ? { valid: true, violations: [] }
    : { valid: false, violations };
}

function permissionDate(
  value: Date | string | null | undefined,
): Date | null | 'invalid' {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : 'invalid';
}

function denied(
  reason: SourceEntitlementDenialReason,
): SourceEntitlementPolicyResult {
  return { allowed: false, reason };
}
