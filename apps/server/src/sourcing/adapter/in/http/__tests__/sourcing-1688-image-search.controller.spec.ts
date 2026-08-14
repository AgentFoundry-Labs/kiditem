import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { Sourcing1688ImageSearchController } from '../sourcing-1688-image-search.controller';

describe('Sourcing1688ImageSearchController', () => {
  it('keeps status GET temporarily read-only', () => {
    const imageSearch = { getStatus: vi.fn(() => ({ configured: true, baseUrl: 'https://overseaplugin.1688.com' })) };
    const controller = new Sourcing1688ImageSearchController(
      imageSearch as never,
      {} as never,
    );

    expect(controller.status('org-1')).toEqual({
      configured: true,
      baseUrl: 'https://overseaplugin.1688.com',
    });
    expect(imageSearch.getStatus).toHaveBeenCalledTimes(1);
  });

  it('accepts only an owner target ID and never passes image data to Playwright', async () => {
    const imageSearch = {
      getStatus: vi.fn(),
      searchByImage: vi.fn(),
    };
    const operationRun = { id: 'run-2', operationKey: 'sourcing.match_wholesale_images' };
    const operationRunner = { start: vi.fn().mockResolvedValue(operationRun) };
    const controller = new Sourcing1688ImageSearchController(
      imageSearch as never,
      operationRunner as never,
    );

    await expect(controller.searchByImage(
      { targetId: ' product-1:: ' },
      'org-1',
      ' image-idem-1 ',
      { id: 'user-1' } as never,
    )).resolves.toBe(operationRun);

    expect(operationRunner.start).toHaveBeenCalledWith({
      organizationId: 'org-1',
      operationKey: 'sourcing.match_wholesale_images',
      triggerSource: 'domain_screen',
      input: { targetIds: ['product-1::'] },
      requestedByUserId: 'user-1',
      idempotencyKey: 'image-idem-1',
    });
    expect(imageSearch.searchByImage).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(
      HTTP_CODE_METADATA,
      Sourcing1688ImageSearchController.prototype.searchByImage,
    )).toBe(HttpStatus.ACCEPTED);
  });
});
