import { Injectable } from '@nestjs/common';
import {
  GeneratedImageValidationError,
  type GeneratedImageValidatorPort,
  type ValidatedGeneratedImage,
} from '../../../application/port/out/provider/generated-image-validator.port';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_GENERATED_IMAGE_PIXELS = 40_000_000;
const MAX_GENERATED_IMAGE_DIMENSION = 8_192;

@Injectable()
export class SharpGeneratedImageValidatorAdapter
  implements GeneratedImageValidatorPort
{
  async validate(input: {
    buffer: Buffer;
    declaredMimeType?: string | null;
  }): Promise<ValidatedGeneratedImage> {
    if (input.buffer.length > MAX_GENERATED_IMAGE_BYTES) {
      throw new GeneratedImageValidationError('generated_image_too_large');
    }

    let metadata: import('sharp').Metadata;
    try {
      metadata = await sharp(input.buffer, {
        failOn: 'error',
        limitInputPixels: false,
      }).metadata();
    } catch {
      throw new GeneratedImageValidationError('generated_image_format_invalid');
    }

    const detectedMimeType = mimeForSharpFormat(metadata.format);
    const declaredMimeType = normalizeMimeType(input.declaredMimeType);
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
      throw new GeneratedImageValidationError('generated_image_format_invalid');
    }

    const width = metadata.width;
    const height = metadata.height;
    if (
      !width ||
      !height ||
      width > MAX_GENERATED_IMAGE_DIMENSION ||
      height > MAX_GENERATED_IMAGE_DIMENSION ||
      width * height > MAX_GENERATED_IMAGE_PIXELS
    ) {
      throw new GeneratedImageValidationError(
        'generated_image_dimensions_invalid',
      );
    }

    let normalized: Buffer;
    try {
      normalized = await sharp(input.buffer, {
        failOn: 'error',
        limitInputPixels: MAX_GENERATED_IMAGE_PIXELS,
      })
        .rotate()
        .toBuffer();
    } catch {
      throw new GeneratedImageValidationError('generated_image_format_invalid');
    }
    if (normalized.length > MAX_GENERATED_IMAGE_BYTES) {
      throw new GeneratedImageValidationError('generated_image_too_large');
    }

    return {
      buffer: normalized,
      mimeType: detectedMimeType,
      extension: extensionForMime(detectedMimeType),
      width,
      height,
      fileSize: normalized.length,
    };
  }
}

function normalizeMimeType(value: string | null | undefined): string | null {
  return value?.split(';')[0]?.trim().toLowerCase() || null;
}

function mimeForSharpFormat(
  format: string | undefined,
): ValidatedGeneratedImage['mimeType'] | null {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return null;
}

function extensionForMime(
  mimeType: ValidatedGeneratedImage['mimeType'],
): ValidatedGeneratedImage['extension'] {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'webp';
}
