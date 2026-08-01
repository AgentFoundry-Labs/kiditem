import { describe, expect, it } from 'vitest';
import { isTerminalOperationStatus } from './useOperationRun';

describe('operation run polling state', () => {
  it('stops only for terminal ledger statuses', () => {
    expect(isTerminalOperationStatus('succeeded')).toBe(true);
    expect(isTerminalOperationStatus('failed')).toBe(true);
    expect(isTerminalOperationStatus('cancelled')).toBe(true);
    expect(isTerminalOperationStatus('skipped')).toBe(true);
    expect(isTerminalOperationStatus('queued')).toBe(false);
    expect(isTerminalOperationStatus('waiting_runtime')).toBe(false);
    expect(isTerminalOperationStatus('running')).toBe(false);
    expect(isTerminalOperationStatus('attention_required')).toBe(false);
  });
});
