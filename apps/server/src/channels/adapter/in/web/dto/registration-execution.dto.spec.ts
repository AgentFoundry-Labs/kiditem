import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ConfirmRegistrationExecutionDto } from './confirm-registration-execution.dto';
import { PrepareWingRegistrationExecutionDto } from './wing-registration-execution.dto';

describe('registration execution DTOs', () => {
  it('accepts an optional real Sellpia SKU selection with a positive unit quantity', async () => {
    const dto = plainToInstance(PrepareWingRegistrationExecutionDto, {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      displayName: '꿀사과슬랑이',
      registrationInput: { wingProduct: { productName: '꿀사과슬랑이' } },
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      sellpiaInventorySkuId: '33333333-3333-4333-8333-333333333333',
      sellpiaQuantity: 1,
    });

    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.sellpiaInventorySkuId).toBe('33333333-3333-4333-8333-333333333333');
    expect(dto.sellpiaQuantity).toBe(1);
  });

  it('keeps external-registration evidence while treating the client channel as non-authoritative', async () => {
    const dto = plainToInstance(ConfirmRegistrationExecutionDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });

    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.evidence).toEqual({ wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' });
  });

  it('requires exact verified WING identity evidence for external completion', async () => {
    const valid = plainToInstance(ConfirmRegistrationExecutionDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });
    expect(await validate(valid)).toHaveLength(0);

    const forged = plainToInstance(ConfirmRegistrationExecutionDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'display-name' },
    });
    expect(await validate(forged)).not.toHaveLength(0);
  });

  it('accepts the deterministic identity sources emitted by the live WING extension', async () => {
    const dto = plainToInstance(ConfirmRegistrationExecutionDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:inline-script' },
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('allows evidence omission so a frozen synced-listing match can be completed', async () => {
    const dto = plainToInstance(ConfirmRegistrationExecutionDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});
