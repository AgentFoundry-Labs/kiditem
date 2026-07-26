import { describe, expect, it } from 'vitest';
import {
  DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
  DETAIL_PAGE_CLIENT_RENDER_LAYOUT_WIDTH,
  DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
  DETAIL_PAGE_CLIENT_RENDER_VARIANT,
  DETAIL_IMAGE_COUNTS,
  DETAIL_PAGE_AGE_GROUPS,
  DETAIL_PAGE_TEMPLATE_IDS,
  DetailPageClientRenderClaimResponseSchema,
  DetailPageClientRenderDocumentResponseSchema,
  DetailPageClientRenderFailBodySchema,
  DetailPageClientRenderFinalizeBodySchema,
  DetailPageClientRenderPrepareResponseSchema,
  DetailPageClientRenderStatusResponseSchema,
  DetailImageCountSchema,
  DetailPageAgeGroupSchema,
  DetailPageTemplateIdSchema,
} from '../ai';

describe('detail page shared AI contracts', () => {
  it('exports the API enum values used by web, DTOs, and Agent OS payloads', () => {
    expect(DETAIL_PAGE_TEMPLATE_IDS).toEqual(['kids-playful', 'bold-vertical']);
    expect(DETAIL_PAGE_AGE_GROUPS).toEqual(['age-8-plus', 'age-14-plus']);
    expect(DETAIL_IMAGE_COUNTS).toEqual(['auto', '1', '2', '3', '4', '5', '6']);
  });

  it('accepts supported detail page control values and rejects unknown values', () => {
    expect(DetailPageTemplateIdSchema.parse('kids-playful')).toBe('kids-playful');
    expect(DetailPageAgeGroupSchema.parse('age-14-plus')).toBe('age-14-plus');
    expect(DetailImageCountSchema.parse('6')).toBe('6');

    expect(() => DetailPageTemplateIdSchema.parse('simple-vertical')).toThrow();
    expect(() => DetailPageAgeGroupSchema.parse('teen')).toThrow();
    expect(() => DetailImageCountSchema.parse('7')).toThrow();
  });

  it('parses the fixed client-render prepare states', () => {
    const revisionId = '11111111-1111-4111-8111-111111111111';
    const artifactId = '22222222-2222-4222-8222-222222222222';
    const intentId = '33333333-3333-4333-8333-333333333333';

    expect(DetailPageClientRenderPrepareResponseSchema.parse({
      status: 'ready',
      artifactId,
      revisionId,
      imageUrl: 'https://assets.example.com/detail.jpg',
      outputWidth: 780,
      contentType: 'image/jpeg',
      byteLength: 390_794,
    }).status).toBe('ready');
    expect(DetailPageClientRenderPrepareResponseSchema.parse({
      status: 'render_required',
      intentId,
      revisionId,
      outputWidth: 780,
      expiresAt: '2026-07-26T01:00:00.000Z',
    }).status).toBe('render_required');
    expect(DetailPageClientRenderPrepareResponseSchema.parse({
      status: 'missing',
      reason: 'no_saved_detail_page',
      message: '저장된 상세페이지가 없습니다.',
    }).status).toBe('missing');
    expect(() => DetailPageClientRenderPrepareResponseSchema.parse({
      status: 'render_required',
      intentId,
      revisionId,
      outputWidth: 800,
      expiresAt: '2026-07-26T01:00:00.000Z',
    })).toThrow();
  });

  it('locks claim and document responses to the fixed renderer contract', () => {
    const intentId = '33333333-3333-4333-8333-333333333333';
    const revisionId = '11111111-1111-4111-8111-111111111111';

    expect(DetailPageClientRenderClaimResponseSchema.parse({
      intentId,
      revisionId,
      variant: 'wing-client-jpeg-v1',
      outputWidth: 780,
      renderDocumentUrl: `https://staging.merchon.org/detail-page-client-render?intentId=${intentId}`,
      upload: {
        url: 'https://storage.example.com/signed-object?signature=secret',
        headers: { 'Content-Type': 'image/jpeg' },
        expiresAt: '2026-07-26T01:00:00.000Z',
      },
    }).variant).toBe(DETAIL_PAGE_CLIENT_RENDER_VARIANT);
    expect(DetailPageClientRenderDocumentResponseSchema.parse({
      intentId,
      revisionId,
      html: '<!doctype html><html><body>detail</body></html>',
      layoutWidth: 720,
      outputWidth: 780,
      requiredAssetPolicy: 'all',
    }).layoutWidth).toBe(DETAIL_PAGE_CLIENT_RENDER_LAYOUT_WIDTH);
    expect(() => DetailPageClientRenderDocumentResponseSchema.parse({
      intentId,
      revisionId,
      html: '<html></html>',
      layoutWidth: 780,
      outputWidth: 780,
      requiredAssetPolicy: 'all',
    })).toThrow();
  });

  it('validates bounded finalize, fail, and status payloads', () => {
    const intentId = '33333333-3333-4333-8333-333333333333';
    const revisionId = '11111111-1111-4111-8111-111111111111';
    const artifactId = '22222222-2222-4222-8222-222222222222';
    const finalized = DetailPageClientRenderFinalizeBodySchema.parse({
      byteLength: 390_794,
      sha256: 'a'.repeat(64),
      pixelWidth: 780,
      pixelHeight: 7_846,
    });
    expect(finalized.pixelWidth).toBe(DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH);
    expect(DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE).toBe('image/jpeg');

    expect(DetailPageClientRenderFailBodySchema.parse({
      code: 'capture_timeout',
      message: 'Chrome 캡처 시간이 초과되었습니다.',
    }).code).toBe('capture_timeout');
    expect(() => DetailPageClientRenderFailBodySchema.parse({
      code: 'capture_timeout',
      message: 'x'.repeat(301),
    })).toThrow();

    expect(DetailPageClientRenderStatusResponseSchema.parse({
      intentId,
      revisionId,
      state: 'completed',
      expiresAt: '2026-07-26T01:00:00.000Z',
      error: null,
      artifact: {
        artifactId,
        revisionId,
        imageUrl: 'https://assets.example.com/detail.jpg',
        outputWidth: 780,
        contentType: 'image/jpeg',
        byteLength: 390_794,
        pixelWidth: 780,
        pixelHeight: 7_846,
        sha256: 'a'.repeat(64),
      },
    }).state).toBe('completed');
  });
});
