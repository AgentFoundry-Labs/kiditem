import { type ArgumentsHost, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceRecordDuplicateError } from '../../../domain/source-record-admission';
import { SourceRecordDuplicateFilter } from './source-record-duplicate.filter';

describe('SourceRecordDuplicateFilter → ADR-0023 envelope', () => {
  beforeEach(() => vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('answers 409 SOURCING_DUPLICATE_RECORD with the refusal sentence and keeps reason and existing in details', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getRequest: () => ({ method: 'POST', url: '/api/sourcing/x' }), getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    const existing = { sourceRecordId: 'r1', salesProductId: 'sp1', salesProductStatus: 'draft' as const };
    const error = new SourceRecordDuplicateError({ kind: 'refuse', reason: 'draft_exists', existing });
    new SourceRecordDuplicateFilter().catch(error, host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'SOURCING_DUPLICATE_RECORD',
      kind: 'conflict',
      message: error.message,
      errors: [],
      details: { reason: 'draft_exists', existing },
    });
  });
});
