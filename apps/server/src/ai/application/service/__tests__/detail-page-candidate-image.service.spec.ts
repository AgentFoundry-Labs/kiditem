import { describe, expect, it, vi } from 'vitest';
import type { DetailPageQueryRepositoryPort } from '../../port/out/repository/detail-page-query.repository.port';
import type { ImageStoragePort } from '../../port/out/storage/image-storage.port';
import type { DetailPageRasterizationService } from '../detail-page-rasterization.service';
import {
  COUPANG_DETAIL_LAYOUT_WIDTH,
  COUPANG_DETAIL_JPEG_QUALITY,
  DetailPageCandidateImageService,
  buildRenderDocument,
} from '../detail-page-candidate-image.service';

const COMPILED_TEMPLATE_CSS = '/*! tailwindcss v4.2.2 */ .text-xl{font-size:1.25rem}';

const ORG = '3bc63d9d-74a1-4806-bbba-1e49710b5467';
const CANDIDATE = '7dbe40a5-8684-4347-b790-c54f014f627d';

function buildService(overrides: {
  savedHtml?: string | null;
  render?: ReturnType<typeof vi.fn>;
  save?: ReturnType<typeof vi.fn>;
} = {}) {
  const findCandidateCurrentDetailPageHtml = vi.fn().mockResolvedValue(
    overrides.savedHtml === undefined
      ? {
          revisionId: 'revision-1',
          artifactId: 'artifact-1',
          html: '<html><head><meta name="viewport" content="width=860, initial-scale=1.0" /></head><body>x</body></html>',
          createdAt: new Date('2026-07-19T00:00:00.000Z'),
        }
      : overrides.savedHtml === null
        ? null
        : {
            revisionId: 'revision-1',
            artifactId: 'artifact-1',
            html: overrides.savedHtml,
            createdAt: new Date('2026-07-19T00:00:00.000Z'),
          },
  );
  const render =
    overrides.render
    ?? vi.fn().mockResolvedValue({
      buffer: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
    });
  const save = overrides.save ?? vi.fn().mockResolvedValue('http://localhost:9000/kiditem/detail.jpg');

  const service = new DetailPageCandidateImageService(
    { findCandidateCurrentDetailPageHtml } as unknown as DetailPageQueryRepositoryPort,
    { render } as unknown as DetailPageRasterizationService,
    { save } as unknown as ImageStoragePort,
    { getCompiledCss: () => COMPILED_TEMPLATE_CSS },
  );
  return { service, findCandidateCurrentDetailPageHtml, render, save };
}

describe('DetailPageCandidateImageService', () => {
  it('uses the compressed JPEG quality selected for long Coupang detail pages', () => {
    expect(COUPANG_DETAIL_JPEG_QUALITY).toBe(82);
  });

  it('renders the saved detail page as one 780px image and returns its storage URL', async () => {
    const { service, render, save } = buildService();

    const result = await service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(result).toMatchObject({
      status: 'rendered',
      imageUrl: 'http://localhost:9000/kiditem/detail.jpg',
      outputWidth: 780,
      contentType: 'image/jpeg',
      revisionId: 'revision-1',
      artifactId: 'artifact-1',
    });
    // 저장 meta가 860이어도 편집기/다운로드 계약인 720에서 렌더하고 출력만 780으로 맞춘다.
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        viewportWidth: COUPANG_DETAIL_LAYOUT_WIDTH,
        outputWidth: 780,
        format: 'jpeg',
        quality: COUPANG_DETAIL_JPEG_QUALITY,
      }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.stringContaining(`detail-page-images/${ORG}/revision-1/`),
      expect.any(Buffer),
      'image/jpeg',
    );
  });

  // 상세페이지가 없을 때 예외/404 대신 명시적 'missing' 을 준다.
  // 호출자가 대표이미지 같은 다른 이미지로 조용히 폴백하지 못하게 하려는 계약이다.
  it('reports missing instead of throwing when no detail page is saved', async () => {
    const { service, render, save } = buildService({ savedHtml: null });

    const result = await service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(result).toEqual({
      status: 'missing',
      reason: 'no_saved_detail_page',
      message: expect.any(String),
    });
    expect(render).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('reports missing when the saved HTML is blank', async () => {
    const { service, render } = buildService({ savedHtml: '   \n  ' });

    const result = await service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(result).toMatchObject({ status: 'missing', reason: 'empty_html' });
    expect(render).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the session organization', async () => {
    const { service, findCandidateCurrentDetailPageHtml } = buildService();

    await service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(findCandidateCurrentDetailPageHtml).toHaveBeenCalledWith({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });
  });
});

describe('buildRenderDocument', () => {
  it('injects a base href so relative assets resolve during capture', () => {
    const doc = buildRenderDocument(
      '<html><head><title>t</title></head><body/></html>',
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
    expect(doc).toContain('<base href="http://localhost:4000/" />');
  });

  it('leaves an existing base tag alone', () => {
    const html = '<html><head><base href="http://example.test/" /></head><body/></html>';
    const doc = buildRenderDocument(html, 'http://localhost:4000', COMPILED_TEMPLATE_CSS);
    expect(doc).toContain('<base href="http://example.test/" />');
    expect(doc).not.toContain('<base href="http://localhost:4000/" />');
  });

  it('wraps a bare fragment in a full document', () => {
    const doc = buildRenderDocument(
      '<section class="text-xl">hi</section>',
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('<section class="text-xl">hi</section>');
  });

  it('hydrates legacy saved HTML with canonical compiled styles exactly once', () => {
    const legacy = '<html><head></head><body><section class="text-xl">hi</section></body></html>';
    const hydrated = buildRenderDocument(legacy, 'http://localhost:4000', COMPILED_TEMPLATE_CSS);
    expect(hydrated).toContain('<style data-kiditem-template-styles>');
    expect(hydrated.match(/tailwindcss v4\.2\.2/g)).toHaveLength(1);

    const renderedAgain = buildRenderDocument(hydrated, 'http://localhost:4000', COMPILED_TEMPLATE_CSS);
    expect(renderedAgain.match(/tailwindcss v4\.2\.2/g)).toHaveLength(1);
  });

  it('does not globally override template image height and crop rules', () => {
    const doc = buildRenderDocument('<img src="hero.jpg" />', 'http://localhost:4000', COMPILED_TEMPLATE_CSS);
    expect(doc).not.toContain('img { max-width: 100% !important;');
    expect(doc).not.toContain('img { height: auto !important;');
  });

  it('repairs the package-image card flattened by legacy editor saves', () => {
    const doc = buildRenderDocument(
      '<div data-role="package-image-frame" style="background:transparent;padding:0"><img src="set.jpg" /></div>',
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
    expect(doc).toContain('background: #eaf6ff !important');
    expect(doc).toContain('padding: 40px !important');
    expect(doc).toContain('object-fit: contain !important');
  });
});
