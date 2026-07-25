import { describe, expect, it, vi } from 'vitest';
import type { DetailPageQueryRepositoryPort } from '../../port/out/repository/detail-page-query.repository.port';
import {
  COUPANG_DETAIL_JPEG_QUALITY,
  DetailPageCandidateImageService,
  buildRenderDocument,
} from '../detail-page-candidate-image.service';

const COMPILED_TEMPLATE_CSS = '/*! tailwindcss v4.2.2 */ .text-xl{font-size:1.25rem}';

const ORG = '3bc63d9d-74a1-4806-bbba-1e49710b5467';
const CANDIDATE = '7dbe40a5-8684-4347-b790-c54f014f627d';
const REVISION = '60620087-f5d8-4307-8591-221fd018eaa0';
const ARTIFACT = '71429ba3-af81-409e-a976-029c67d86bcb';

function buildService(overrides: {
  savedHtml?: string | null;
  jobStatus?: { status: string; [key: string]: unknown };
  ensureStatus?: { status: string; [key: string]: unknown };
} = {}) {
  const findCandidateCurrentDetailPageHtml = vi.fn().mockResolvedValue(
    overrides.savedHtml === undefined
      ? {
          revisionId: REVISION,
          artifactId: ARTIFACT,
          html: '<html><head><meta name="viewport" content="width=860, initial-scale=1.0" /></head><body>x</body></html>',
          createdAt: new Date('2026-07-19T00:00:00.000Z'),
        }
      : overrides.savedHtml === null
        ? null
        : {
            revisionId: REVISION,
            artifactId: ARTIFACT,
            html: overrides.savedHtml,
            createdAt: new Date('2026-07-19T00:00:00.000Z'),
          },
  );
  const statusForRevision = vi.fn().mockResolvedValue(
    overrides.jobStatus ?? {
      status: 'rendered',
      output: {
        revisionId: REVISION,
        artifactId: ARTIFACT,
        imageUrl: 'http://localhost:9000/kiditem/detail.jpg',
        outputWidth: 780,
        contentType: 'image/jpeg',
        byteLength: 10,
      },
    },
  );
  const ensureScheduled = vi.fn().mockResolvedValue(
    overrides.ensureStatus ?? { status: 'processing' },
  );

  const service = new DetailPageCandidateImageService(
    { findCandidateCurrentDetailPageHtml } as unknown as DetailPageQueryRepositoryPort,
    { statusForRevision, ensureScheduled } as never,
  );
  return {
    service,
    findCandidateCurrentDetailPageHtml,
    statusForRevision,
    ensureScheduled,
  };
}

describe('DetailPageCandidateImageService', () => {
  it('uses the compressed JPEG quality selected for long Coupang detail pages', () => {
    expect(COUPANG_DETAIL_JPEG_QUALITY).toBe(82);
  });

  it('returns the cached 780px rendition without invoking a renderer or storage', async () => {
    const { service, statusForRevision, ensureScheduled } = buildService();

    const result = await service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(result).toMatchObject({
      status: 'rendered',
      imageUrl: 'http://localhost:9000/kiditem/detail.jpg',
      outputWidth: 780,
      contentType: 'image/jpeg',
      revisionId: REVISION,
      artifactId: ARTIFACT,
    });
    expect(statusForRevision).toHaveBeenCalledWith({
      organizationId: ORG,
      revisionId: REVISION,
      outputWidth: 780,
    });
    expect(ensureScheduled).not.toHaveBeenCalled();
  });

  it('lazy-enqueues a legacy saved revision and returns processing immediately', async () => {
    const { service, ensureScheduled } = buildService({
      jobStatus: { status: 'absent' },
    });

    await expect(service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    })).resolves.toMatchObject({
      status: 'processing',
      revisionId: REVISION,
      artifactId: ARTIFACT,
    });
    expect(ensureScheduled).toHaveBeenCalledWith({
      organizationId: ORG,
      revisionId: REVISION,
      artifactId: ARTIFACT,
      outputWidth: 780,
    });
  });

  it('does not enqueue a second job while the rendition is processing', async () => {
    const { service, ensureScheduled } = buildService({
      jobStatus: { status: 'processing' },
    });

    await expect(service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    })).resolves.toMatchObject({ status: 'processing' });
    expect(ensureScheduled).not.toHaveBeenCalled();
  });

  it('reports a failed job during polling and restarts it only on an explicit retry', async () => {
    const { service, ensureScheduled } = buildService({
      jobStatus: { status: 'failed', message: 'Puppeteer failed' },
    });

    await expect(service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
      retryFailed: false,
    })).resolves.toMatchObject({ status: 'failed', message: 'Puppeteer failed' });
    expect(ensureScheduled).not.toHaveBeenCalled();

    await expect(service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
      retryFailed: true,
    })).resolves.toMatchObject({ status: 'processing' });
    expect(ensureScheduled).toHaveBeenCalledOnce();
  });

  // 상세페이지가 없을 때 예외/404 대신 명시적 'missing' 을 준다.
  // 호출자가 대표이미지 같은 다른 이미지로 조용히 폴백하지 못하게 하려는 계약이다.
  it('reports missing instead of throwing when no detail page is saved', async () => {
    const { service, statusForRevision, ensureScheduled } = buildService({ savedHtml: null });

    const result = await service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(result).toEqual({
      status: 'missing',
      reason: 'no_saved_detail_page',
      message: expect.any(String),
    });
    expect(statusForRevision).not.toHaveBeenCalled();
    expect(ensureScheduled).not.toHaveBeenCalled();
  });

  it('reports missing when the saved HTML is blank', async () => {
    const { service, statusForRevision } = buildService({ savedHtml: '   \n  ' });

    const result = await service.renderCandidateDetailImage({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(result).toMatchObject({ status: 'missing', reason: 'empty_html' });
    expect(statusForRevision).not.toHaveBeenCalled();
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
