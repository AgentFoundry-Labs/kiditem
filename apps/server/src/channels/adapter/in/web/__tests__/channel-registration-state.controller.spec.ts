import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SalesProductRegistrationStateSchema } from '@kiditem/shared/sales-product';
import { ChannelRegistrationExecutionController } from '../channel-registration-execution.controller';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';

describe('ChannelRegistrationExecutionController.registrationState', () => {
  it('answers the draft registration state in the shared contract shape', async () => {
    const readForSalesProducts = vi.fn().mockResolvedValue(new Map([[PRODUCT, {
      registrationState: 'confirming',
      preparations: [{
        id: TARGET, salesProductId: PRODUCT, sourceRecordId: null, channelAccountId: ACCOUNT,
        channelListingId: null, displayName: null, status: 'submitting',
        selectedThumbnailUrl: null, selectedThumbnailGenerationId: null, selectedThumbnailGenerationCandidateId: null,
        selectedDetailPageArtifactId: null, selectedDetailPageRevisionId: null, selectedDetailPageGenerationId: null,
        registrationInput: {}, createdAt: new Date('2026-09-23T00:00:00Z'), updatedAt: new Date('2026-09-23T01:00:00Z'),
      }],
    }]]));
    const controller = new ChannelRegistrationExecutionController({} as never, { readForSalesProducts } as never);

    const state = await controller.registrationState(PRODUCT, 'org-1');

    expect(SalesProductRegistrationStateSchema.parse(state)).toEqual(state);
    expect(state).toMatchObject({ registrationState: 'confirming', targets: [{ id: TARGET, status: 'submitting' }] });
    expect(readForSalesProducts).toHaveBeenCalledWith('org-1', [PRODUCT]);
  });

  it('answers 404 for a draft this organization does not have', async () => {
    const controller = new ChannelRegistrationExecutionController(
      {} as never, { readForSalesProducts: vi.fn().mockResolvedValue(new Map()) } as never,
    );
    await expect(controller.registrationState(PRODUCT, 'org-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
