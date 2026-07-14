import { describe, expect, it } from 'vitest';
import {
  GetMasterImagesResponseSchema,
  MasterImageItemSchema,
  MasterImageRoleSchema,
  UpdateMasterImagesRequestSchema,
  UploadMasterImageResponseSchema,
} from './product.js';

const image = {
  id: '00000000-0000-4000-8000-000000000001',
  url: 'https://example.com/product.png',
  storageKey: 'content/product.png',
  role: 'product' as const,
  label: '대표 이미지',
  sortOrder: 0,
  source: 'content_workspace',
  mimeType: 'image/png',
  width: 1200,
  height: 1200,
  fileSize: 1024,
  isPrimary: true,
};

describe('ContentWorkspace image contracts', () => {
  it('keeps the supported image roles explicit', () => {
    expect(MasterImageRoleSchema.options).toEqual([
      'box',
      'product',
      'color_variant',
      'size_chart',
      'detail',
    ]);
  });

  it('validates one persisted image projection', () => {
    expect(MasterImageItemSchema.parse(image)).toEqual(image);
  });

  it('uses the same image contract for all endpoint envelopes', () => {
    expect(GetMasterImagesResponseSchema.parse({ images: [image] }).images).toEqual([image]);
    expect(UpdateMasterImagesRequestSchema.parse({ items: [image] }).items).toEqual([image]);
    expect(UploadMasterImageResponseSchema.parse({ image }).image).toEqual(image);
  });
});
