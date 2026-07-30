import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateProductPreparationDto } from './create-product-preparation.dto';
import { UpdateProductPreparationDto } from './update-product-preparation.dto';
import { ConfirmExternalRegistrationDto } from './confirm-external-registration.dto';
import { PrepareExternalWingRegistrationDto } from './external-wing-registration.dto';

describe('product preparation DTOs', () => {
  it('accepts an optional real Sellpia SKU selection with a positive unit quantity', async () => {
    const dto = plainToInstance(PrepareExternalWingRegistrationDto, {
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

  it('rejects a blank create display name', async () => {
    const dto = plainToInstance(CreateProductPreparationDto, {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      displayName: '   ',
      registrationInput: { listingPayload: { sellerProductName: 'Rain boots' } },
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an empty update command', async () => {
    const dto = plainToInstance(UpdateProductPreparationDto, {});

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts an explicit nullable selection update', async () => {
    const dto = plainToInstance(UpdateProductPreparationDto, {
      selectedThumbnailUrl: null,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts optimistic concurrency metadata only with an editable patch field', async () => {
    const patch = plainToInstance(UpdateProductPreparationDto, {
      registrationInput: { salePrice: 23900 },
      basePreparationUpdatedAt: '2026-07-13T01:02:03.000Z',
    });
    const metadataOnly = plainToInstance(UpdateProductPreparationDto, {
      basePreparationUpdatedAt: '2026-07-13T01:02:03.000Z',
    });

    expect(await validate(patch)).toHaveLength(0);
    expect(await validate(metadataOnly)).not.toHaveLength(0);
  });

  it('keeps external-registration evidence while treating the client channel as non-authoritative', async () => {
    const dto = plainToInstance(ConfirmExternalRegistrationDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });

    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.evidence).toEqual({ wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' });
  });

  it('requires exact verified WING identity evidence for external completion', async () => {
    const valid = plainToInstance(ConfirmExternalRegistrationDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });
    expect(await validate(valid)).toHaveLength(0);

    const forged = plainToInstance(ConfirmExternalRegistrationDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'display-name' },
    });
    expect(await validate(forged)).not.toHaveLength(0);
  });

  it('accepts the deterministic identity sources emitted by the live WING extension', async () => {
    const dto = plainToInstance(ConfirmExternalRegistrationDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:inline-script' },
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('allows evidence omission so a frozen synced-listing match can be completed', async () => {
    const dto = plainToInstance(ConfirmExternalRegistrationDto, {
      executionId: '11111111-1111-4111-8111-111111111111',
      externalListingId: '427011919',
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});
