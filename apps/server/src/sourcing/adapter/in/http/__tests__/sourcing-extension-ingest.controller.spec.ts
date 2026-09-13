import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SourcingExtensionIngestController } from '../sourcing-extension-ingest.controller';
import type { AuthUser } from '../../../../../auth/auth.types';

const authUser: AuthUser = {
  id: 'user-1',
  organizationId: 'org-1',
  membershipId: 'membership-1',
  role: 'admin',
  type: 'human',
  email: 'user@example.com',
};

describe('SourcingExtensionIngestController', () => {
  it('passes a browser-generated Idempotency-Key into product generation', async () => {
    const sourcing = {
      createProductGeneration: vi.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new SourcingExtensionIngestController(sourcing as never, {} as never);
    const body = { title: '자석 다트게임', imageUrls: ['https://example.com/main.jpg'] };

    await controller.createProductGeneration(body as never, 'org-1', authUser, 'product-generation-key');

    expect(sourcing.createProductGeneration).toHaveBeenCalledWith(
      body,
      'org-1',
      'user-1',
      'product-generation-key',
    );
  });

  it('rejects product generation without a caller-generated Idempotency-Key', async () => {
    const controller = new SourcingExtensionIngestController({} as never, {} as never);

    await expect(controller.createProductGeneration(
      { title: '자석 다트게임', imageUrls: ['https://example.com/main.jpg'] } as never,
      'org-1',
      authUser,
      undefined,
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
