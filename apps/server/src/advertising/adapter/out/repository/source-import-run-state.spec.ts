import { describe, expect, it } from 'vitest';
import {
  effectiveSourceImportRunState,
  sourceImportRunDbState,
} from './source-import-run-state';

describe('source import run state facts', () => {
  it('derives public state from the persisted state and expiry once', () => {
    const now = new Date('2026-09-13T00:00:00.000Z');
    expect(effectiveSourceImportRunState({
      status: 'running',
      expiresAt: new Date('2026-09-13T00:01:00.000Z'),
    }, now)).toBe('RUNNING');
    expect(effectiveSourceImportRunState({
      status: 'running',
      expiresAt: now,
    }, now)).toBe('FAILED');
    expect(effectiveSourceImportRunState({
      status: 'completed',
      expiresAt: new Date('2026-09-12T00:00:00.000Z'),
    }, now)).toBe('COMPLETE');
  });

  it('fails closed for an unknown persisted value', () => {
    expect(sourceImportRunDbState('complete')).toBe('failed');
  });
});
