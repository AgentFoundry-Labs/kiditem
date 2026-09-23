import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SalesProductRegistrationStateSchema } from '@kiditem/shared/sales-product';
import { ChannelRegistrationExecutionController } from '../channel-registration-execution.controller';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const EXECUTION = '44444444-4444-4444-8444-444444444444';

describe('ChannelRegistrationExecutionController.registrationState', () => {
  it('answers the per-account registration state in the shared contract shape', async () => {
    const account = {
      channelAccountId: ACCOUNT, channel: 'mall-a', channelAccountName: '몰 A', registrationTargetId: TARGET,
      channelListingId: null, externalListingId: null, state: 'submitting', soldOut: false, changedSinceRegistration: false,
      selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null,
      lastExecution: { id: EXECUTION, kind: 'register', status: 'executing', providerOutcome: 'not_attempted', createdAt: '2026-09-24T00:00:00.000Z', completedAt: null },
    };
    const readForSalesProducts = vi.fn().mockResolvedValue(new Map([[PRODUCT, { accounts: [account] }]]));
    const controller = new ChannelRegistrationExecutionController({ readForSalesProducts } as never);

    const state = await controller.registrationState(PRODUCT, 'org-1');

    expect(SalesProductRegistrationStateSchema.parse(state)).toEqual(state);
    expect(state).toEqual({ accounts: [account] });
    expect(readForSalesProducts).toHaveBeenCalledWith('org-1', [PRODUCT]);
  });

  it('answers 404 for a draft this organization does not have', async () => {
    const controller = new ChannelRegistrationExecutionController(
      { readForSalesProducts: vi.fn().mockResolvedValue(new Map()) } as never,
    );
    await expect(controller.registrationState(PRODUCT, 'org-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
