import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../port/out/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/image-storage.port';
import {
  MAX_FETCH_BYTES,
  parseDataImageUrl,
} from '../../domain/thumbnail-image-source';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

export interface PercentCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropImageCommand {
  organizationId: string;
  imageUrl: string;
  crop: PercentCropRect;
}

export interface CropImageResult {
  imageUrl: string;
  storageKey: string;
  mimeType: 'image/png';
}

interface SourceImage {
  buffer: Buffer;
  mimeType: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeCropRect(rect: PercentCropRect): PercentCropRect {
  const x = clamp(rect.x, 0, 99);
  const y = clamp(rect.y, 0, 99);
  return {
    x,
    y,
    width: clamp(rect.width, 1, 100 - x),
    height: clamp(rect.height, 1, 100 - y),
  };
}

function cropToExtractBox(
  crop: PercentCropRect,
  imageWidth: number,
  imageHeight: number,
): { left: number; top: number; width: number; height: number } {
  const rect = normalizeCropRect(crop);
  const left = Math.floor((imageWidth * rect.x) / 100);
  const top = Math.floor((imageHeight * rect.y) / 100);
  const right = Math.ceil((imageWidth * (rect.x + rect.width)) / 100);
  const bottom = Math.ceil((imageHeight * (rect.y + rect.height)) / 100);

  return {
    left: clamp(left, 0, imageWidth - 1),
    top: clamp(top, 0, imageHeight - 1),
    width: Math.max(1, clamp(right, left + 1, imageWidth) - left),
    height: Math.max(1, clamp(bottom, top + 1, imageHeight) - top),
  };
}

@Injectable()
export class ImageAssetOperationService {
  constructor(
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
  ) {}

  async cropImage(command: CropImageCommand): Promise<CropImageResult> {
    const source = await this.resolveSourceImage(command.imageUrl);
    this.imageFetcher.assertSupportedMime(source.mimeType);

    const image = sharp(source.buffer, { failOn: 'none' }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('crop image dimensions unavailable');
    }

    const box = cropToExtractBox(command.crop, metadata.width, metadata.height);
    const buffer = await image
      .extract(box)
      .png()
      .toBuffer();
    const storageKey = this.cropStorageKey(command.organizationId);
    const imageUrl = await this.storage.save(storageKey, buffer, 'image/png');

    return {
      imageUrl,
      storageKey,
      mimeType: 'image/png',
    };
  }

  private async resolveSourceImage(imageUrl: string): Promise<SourceImage> {
    const dataImage = parseDataImageUrl(imageUrl);
    if (dataImage) {
      this.imageFetcher.assertSupportedMime(dataImage.mimeType);
      const buffer = Buffer.from(dataImage.base64, 'base64');
      if (buffer.byteLength > MAX_FETCH_BYTES) {
        throw new BadRequestException('image is too large');
      }
      return {
        buffer,
        mimeType: dataImage.mimeType,
      };
    }

    const ownStorageKey = this.storage.extractKey(imageUrl);
    const fetched = ownStorageKey
      ? await this.imageFetcher.fetchTrustedStorageImage(imageUrl)
      : await this.imageFetcher.fetchImage(imageUrl);

    return {
      buffer: fetched.buffer,
      mimeType: fetched.mimeType,
    };
  }

  private cropStorageKey(organizationId: string): string {
    const safeOrganizationId = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `tmp/image-crops/${safeOrganizationId}/crop-${randomUUID()}.png`;
  }
}
