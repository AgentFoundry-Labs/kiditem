import { describe, expect, it } from 'vitest';
import {
  SOURCE_ENTITLEMENT_OPERATIONS,
  evaluateSourceEntitlement,
  validateSourceEntitlementVersion,
  type SourceEntitlementOperation,
} from './source-entitlement-policy';

const NOW = new Date('2026-08-01T00:00:00.000Z');
const FUTURE = new Date('2026-08-02T00:00:00.000Z');

function evaluate(
  overrides: Partial<Parameters<typeof evaluateSourceEntitlement>[0]> = {},
) {
  return evaluateSourceEntitlement({
    lifecycle: 'qualified',
    decisionImpact: 'enabled',
    operation: 'score',
    killSwitch: false,
    permissionStartsAt: new Date('2026-07-01T00:00:00.000Z'),
    permissionExpiresAt: FUTURE,
    at: NOW,
    ...overrides,
  });
}

describe('source entitlement policy', () => {
  it.each(['score', 'train'] as const)(
    'allows %s only for a live qualified entitlement with enabled impact',
    (operation) => {
      expect(evaluate({ operation })).toEqual({ allowed: true, reason: null });
      expect(evaluate({ operation, decisionImpact: 'disabled' })).toEqual({
        allowed: false,
        reason: 'decision_impact_disabled',
      });
    },
  );

  it.each(['onboarding', 'shadow'] as const)(
    'allows collection and retention but not decision use in %s lifecycle',
    (lifecycle) => {
      expect(evaluate({ lifecycle, decisionImpact: 'disabled', operation: 'collect' }))
        .toEqual({ allowed: true, reason: null });
      expect(evaluate({ lifecycle, decisionImpact: 'disabled', operation: 'retain' }))
        .toEqual({ allowed: true, reason: null });
      expect(evaluate({ lifecycle, decisionImpact: 'disabled', operation: 'score' }))
        .toEqual({ allowed: false, reason: 'lifecycle_not_qualified' });
      expect(evaluate({ lifecycle, decisionImpact: 'disabled', operation: 'train' }))
        .toEqual({ allowed: false, reason: 'lifecycle_not_qualified' });
    },
  );

  it('allows qualified evidence to be collected and retained while decision impact is disabled', () => {
    expect(evaluate({ decisionImpact: 'disabled', operation: 'collect' }))
      .toEqual({ allowed: true, reason: null });
    expect(evaluate({ decisionImpact: 'disabled', operation: 'retain' }))
      .toEqual({ allowed: true, reason: null });
  });

  it.each(SOURCE_ENTITLEMENT_OPERATIONS)(
    'blocks %s immediately when the kill switch is on',
    (operation: SourceEntitlementOperation) => {
      expect(evaluate({ operation, killSwitch: true })).toEqual({
        allowed: false,
        reason: 'kill_switch_enabled',
      });
    },
  );

  it.each(SOURCE_ENTITLEMENT_OPERATIONS)(
    'blocks %s for a suspended entitlement',
    (operation: SourceEntitlementOperation) => {
      expect(evaluate({ operation, lifecycle: 'suspended', decisionImpact: 'disabled' }))
        .toEqual({ allowed: false, reason: 'lifecycle_suspended' });
    },
  );

  it.each(SOURCE_ENTITLEMENT_OPERATIONS)(
    'blocks %s for a proposed entitlement',
    (operation: SourceEntitlementOperation) => {
      expect(evaluate({ operation, lifecycle: 'proposed', decisionImpact: 'disabled' }))
        .toEqual({ allowed: false, reason: 'lifecycle_proposed' });
    },
  );

  it('treats the exact expiry instant as expired and rejects invalid expiry values', () => {
    expect(evaluate({ permissionExpiresAt: NOW })).toEqual({
      allowed: false,
      reason: 'permission_expired',
    });
    expect(evaluate({ permissionExpiresAt: 'not-a-date' })).toEqual({
      allowed: false,
      reason: 'invalid_permission_expiry',
    });
  });

  it('blocks every use before permission starts and rejects an invalid start date', () => {
    expect(evaluate({ permissionStartsAt: FUTURE })).toEqual({
      allowed: false,
      reason: 'permission_not_started',
    });
    expect(evaluate({ permissionStartsAt: 'not-a-date' })).toEqual({
      allowed: false,
      reason: 'invalid_permission_start',
    });
  });

  it('rejects invalid entitlement versions without framework exceptions', () => {
    expect(validateSourceEntitlementVersion({
      lifecycle: 'shadow',
      decisionImpact: 'enabled',
      killSwitch: false,
    })).toEqual({
      valid: false,
      violations: ['decision_impact_requires_qualified_lifecycle'],
    });

    expect(validateSourceEntitlementVersion({
      lifecycle: 'qualified',
      decisionImpact: 'enabled',
      killSwitch: true,
    })).toEqual({
      valid: false,
      violations: ['kill_switch_conflicts_with_enabled_impact'],
    });

    expect(validateSourceEntitlementVersion({
      lifecycle: 'suspended',
      decisionImpact: 'enabled',
      killSwitch: true,
    })).toEqual({
      valid: false,
      violations: [
        'decision_impact_requires_qualified_lifecycle',
        'kill_switch_conflicts_with_enabled_impact',
      ],
    });
  });

  it('accepts shadow-disabled and qualified-enabled versions', () => {
    expect(validateSourceEntitlementVersion({
      lifecycle: 'shadow',
      decisionImpact: 'disabled',
      killSwitch: false,
    })).toEqual({ valid: true, violations: [] });
    expect(validateSourceEntitlementVersion({
      lifecycle: 'qualified',
      decisionImpact: 'enabled',
      killSwitch: false,
    })).toEqual({ valid: true, violations: [] });
  });
});
