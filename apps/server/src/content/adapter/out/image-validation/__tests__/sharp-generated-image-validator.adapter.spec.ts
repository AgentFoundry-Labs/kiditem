import { describe, expect, it } from 'vitest';
import {
  GeneratedImageValidationError,
} from '../../../../application/port/out/provider/generated-image-validator.port';
import { SharpGeneratedImageValidatorAdapter } from '../sharp-generated-image-validator.adapter';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

describe('SharpGeneratedImageValidatorAdapter', () => {
  const validator = new SharpGeneratedImageValidatorAdapter();

  it('returns detected metadata for a valid generated PNG', async () => {
    const buffer = await makePng();

    await expect(
      validator.validate({ buffer, declaredMimeType: 'image/png' }),
    ).resolves.toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      width: 32,
      height: 32,
    });
  });

  it('rejects a provider MIME type that does not match the bytes', async () => {
    await expectValidationCode(
      validator.validate({
        buffer: await makePng(),
        declaredMimeType: 'image/jpeg',
      }),
      'generated_image_format_invalid',
    );
  });

  it('rejects undecodable provider bytes', async () => {
    await expectValidationCode(
      validator.validate({
        buffer: Buffer.from('not-an-image'),
        declaredMimeType: 'image/png',
      }),
      'generated_image_format_invalid',
    );
  });

  it('rejects a generated payload over 20 MiB', async () => {
    await expectValidationCode(
      validator.validate({
        buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
        declaredMimeType: 'image/png',
      }),
      'generated_image_too_large',
    );
  });

  it('rejects a generated image wider than 8,192 pixels', async () => {
    const buffer = patchPngDimensions(await makePng(), 8_193, 1);

    await expectValidationCode(
      validator.validate({ buffer, declaredMimeType: 'image/png' }),
      'generated_image_dimensions_invalid',
    );
  });

  it('rejects a generated image over 40,000,000 pixels', async () => {
    const buffer = patchPngDimensions(await makePng(), 8_000, 5_001);

    await expectValidationCode(
      validator.validate({ buffer, declaredMimeType: 'image/png' }),
      'generated_image_dimensions_invalid',
    );
  });
});

async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function expectValidationCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: GeneratedImageValidationError.name,
    code,
  });
}

function patchPngDimensions(
  original: Buffer,
  width: number,
  height: number,
): Buffer {
  const patched = Buffer.from(original);
  patched.writeUInt32BE(width, 16);
  patched.writeUInt32BE(height, 20);
  patched.writeUInt32BE(crc32(patched.subarray(12, 29)), 29);
  return patched;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
