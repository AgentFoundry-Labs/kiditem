import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { Sourcing1688KeywordSearchController } from '../sourcing-1688-keyword-search.controller';

describe('Sourcing1688KeywordSearchController', () => {
  it('keeps status GET temporarily read-only', () => {
    const keywordSearch = { getStatus: vi.fn(() => ({ configured: true, baseUrl: 'https://s.1688.com' })) };
    const controller = new Sourcing1688KeywordSearchController(
      keywordSearch as never,
      {} as never,
    );

    expect(controller.status('org-1')).toEqual({
      configured: true,
      baseUrl: 'https://s.1688.com',
    });
    expect(keywordSearch.getStatus).toHaveBeenCalledTimes(1);
  });

  it('returns an accepted OperationRun facade without invoking Playwright work', async () => {
    const keywordSearch = {
      getStatus: vi.fn(),
      searchByKeyword: vi.fn(),
    };
    const operationRun = { id: 'run-1', operationKey: 'sourcing.search_1688_keyword_batch' };
    const operationRunner = { start: vi.fn().mockResolvedValue(operationRun) };
    const controller = new Sourcing1688KeywordSearchController(
      keywordSearch as never,
      operationRunner as never,
    );

    await expect(controller.searchByKeyword(
      { keyword: '  Ａ   Pencil  ' },
      'org-1',
      ' idem-1 ',
      { id: 'user-1' } as never,
    )).resolves.toBe(operationRun);

    expect(operationRunner.start).toHaveBeenCalledWith({
      organizationId: 'org-1',
      operationKey: 'sourcing.search_1688_keyword_batch',
      triggerSource: 'domain_screen',
      input: { keywords: ['A Pencil'] },
      requestedByUserId: 'user-1',
      idempotencyKey: 'idem-1',
    });
    expect(keywordSearch.searchByKeyword).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(
      HTTP_CODE_METADATA,
      Sourcing1688KeywordSearchController.prototype.searchByKeyword,
    )).toBe(HttpStatus.ACCEPTED);
  });
});
