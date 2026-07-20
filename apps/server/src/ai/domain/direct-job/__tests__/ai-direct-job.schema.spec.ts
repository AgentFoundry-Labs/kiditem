import { describe, expect, it } from 'vitest';
import { AiDirectJobEnvelopeSchema } from '../ai-direct-job.schema';

const thumbnailQueuedInput = {
  mode: 'edit' as const,
  editCase: 'single' as const,
  purpose: 'compliance' as const,
  inputs: [
    {
      mimeType: 'image/png',
      label: '상품 이미지',
      url: 'https://storage.example.com/thumbnail-inputs/org/input.png',
      storageKey: 'thumbnail-inputs/org/input.png',
      role: 'product' as const,
      sortOrder: 0,
      source: 'upload',
      fileSize: 1024,
    },
  ],
};

describe('AiDirectJobEnvelopeSchema', () => {
  it('requires an explicit model plan for thumbnail jobs', () => {
    expect(() =>
      AiDirectJobEnvelopeSchema.parse({
        jobType: 'thumbnail_generate',
        models: {},
        input: thumbnailQueuedInput,
      }),
    ).toThrow();
  });

  it('forbids persisted thumbnail base64 payloads', () => {
    expect(() =>
      AiDirectJobEnvelopeSchema.parse({
        jobType: 'thumbnail_generate',
        models: { image: 'gemini-image-model' },
        input: {
          ...thumbnailQueuedInput,
          inputs: [
            {
              ...thumbnailQueuedInput.inputs[0],
              data: 'base64-is-forbidden',
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('accepts a durable managed thumbnail input envelope', () => {
    expect(
      AiDirectJobEnvelopeSchema.parse({
        jobType: 'thumbnail_generate',
        models: { image: 'gemini-image-model' },
        input: thumbnailQueuedInput,
      }),
    ).toMatchObject({
      jobType: 'thumbnail_generate',
      models: { image: 'gemini-image-model' },
    });
  });

  it('requires text, image, and vision models for detail-page jobs', () => {
    expect(() =>
      AiDirectJobEnvelopeSchema.parse({
        jobType: 'detail_page_generate',
        models: { image: 'gemini-image-model' },
        input: {
          templateId: 'kids-playful',
          raw: { rawTitle: '상품', imageUrls: [] },
          heroImageMode: 'first',
        },
      }),
    ).toThrow();
  });
});
