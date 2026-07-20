import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateProductPreparationDto } from './create-product-preparation.dto';
import { UpdateProductPreparationDto } from './update-product-preparation.dto';
import { ConfirmExternalRegistrationDto } from './confirm-external-registration.dto';

describe('product preparation DTOs', () => {
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
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Rain boots',
      externalListingId: '427011919',
      channel: 'rocket',
      evidence: { source: 'wing', completedAt: '2026-07-20T00:00:00.000Z' },
    });

    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.evidence).toEqual({ source: 'wing', completedAt: '2026-07-20T00:00:00.000Z' });
  });
});
