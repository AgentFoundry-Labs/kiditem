import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateProductPreparationDto } from './create-product-preparation.dto';
import { UpdateProductPreparationDto } from './update-product-preparation.dto';

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
});
