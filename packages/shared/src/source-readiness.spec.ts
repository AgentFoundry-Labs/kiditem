import { describe, expect, it } from 'vitest';
import {
  SOURCE_READINESS_LABELS,
  deriveSourceReadiness,
  sourceReadinessStatus,
} from './source-readiness.js';

const complete = { actualCutoff: '2026-09-12' } as const;

describe('deriveSourceReadiness', () => {
  it.each(['RUNNING', 'FAILED'] as const)(
    'keeps a cutoff-valid completed snapshot ready while the latest attempt is %s',
    (state) => {
      expect(deriveSourceReadiness({
        latestAttempt: { state },
        latestComplete: complete,
        requiredCutoff: '2026-09-12',
      })).toEqual({
        ready: true,
        requiredCutoff: '2026-09-12',
        actualCutoff: '2026-09-12',
        latestAttempt: { state },
        latestComplete: complete,
      });
    },
  );

  it.each([
    {
      name: 'no completed snapshot',
      latestComplete: null,
      requiredCutoff: '2026-09-12',
      actualCutoff: null,
    },
    {
      name: 'completed snapshot has no actual cutoff',
      latestComplete: { actualCutoff: null },
      requiredCutoff: '2026-09-12',
      actualCutoff: null,
    },
    {
      name: 'completed snapshot is behind the required cutoff',
      latestComplete: { actualCutoff: '2026-09-11' },
      requiredCutoff: '2026-09-12',
      actualCutoff: '2026-09-11',
    },
  ])('does not call $name ready', ({ latestComplete, requiredCutoff, actualCutoff }) => {
    expect(deriveSourceReadiness({
      latestAttempt: { state: 'COMPLETE' },
      latestComplete,
      requiredCutoff,
    })).toEqual({
      ready: false,
      requiredCutoff,
      actualCutoff,
      latestAttempt: { state: 'COMPLETE' },
      latestComplete,
    });
  });
});

describe('sourceReadinessStatus', () => {
  it.each([
    { source: { ready: true, latestComplete: complete }, status: 'ready', label: '최신' },
    { source: { ready: false, latestComplete: complete }, status: 'stale', label: '갱신 필요' },
    { source: { ready: false, latestComplete: { actualCutoff: null } }, status: 'missing', label: '미수집' },
    { source: { ready: false, latestComplete: null }, status: 'missing', label: '미수집' },
  ] as const)('derives $status and its one canonical label', ({ source, status, label }) => {
    expect(sourceReadinessStatus(source)).toBe(status);
    expect(SOURCE_READINESS_LABELS[status]).toBe(label);
  });
});
