import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SalesProductGenerationController } from '../sales-product-generation.controller';
import type { AuthUser } from '../../../../../auth/auth.types';

const SALES_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const authUser: AuthUser = {
  id: 'user-1',
  organizationId: 'org-1',
  membershipId: 'membership-1',
  role: 'admin',
  type: 'human',
  email: 'user@example.com',
};

describe('SalesProductGenerationController', () => {
  it('starts generation for the sales product draft with the caller-stable idempotency key', async () => {
    const sourcingService = {
      startProductGeneration: vi.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new SalesProductGenerationController(sourcingService as never);

    await controller.startGeneration(SALES_PRODUCT_ID, undefined, 'org-1', authUser, 'generation-key');

    expect(sourcingService.startProductGeneration).toHaveBeenCalledWith(
      SALES_PRODUCT_ID,
      'org-1',
      'user-1',
      'all',
      'generation-key',
    );
  });

  it('rejects generation without a caller-generated Idempotency-Key', async () => {
    const controller = new SalesProductGenerationController({} as never);

    await expect(controller.startGeneration(SALES_PRODUCT_ID, undefined, 'org-1', authUser, undefined))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
