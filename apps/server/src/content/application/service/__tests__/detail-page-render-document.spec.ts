import { describe, expect, it } from 'vitest';
import {
  COUPANG_DETAIL_JPEG_QUALITY,
  buildRenderDocument,
} from '../detail-page-render-document';

const COMPILED_TEMPLATE_CSS =
  '/*! tailwindcss v4.2.2 */ .text-xl{font-size:1.25rem}';

describe('buildRenderDocument', () => {
  it('keeps the compressed JPEG quality selected for long Coupang detail pages', () => {
    expect(COUPANG_DETAIL_JPEG_QUALITY).toBe(82);
  });

  it('injects a base href so relative assets resolve during capture', () => {
    const doc = buildRenderDocument(
      '<html><head><title>t</title></head><body/></html>',
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
    expect(doc).toContain('<base href="http://localhost:4000/" />');
  });

  it('leaves an existing base tag alone', () => {
    const html =
      '<html><head><base href="http://example.test/" /></head><body/></html>';
    const doc = buildRenderDocument(
      html,
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
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
    const legacy =
      '<html><head></head><body><section class="text-xl">hi</section></body></html>';
    const hydrated = buildRenderDocument(
      legacy,
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
    expect(hydrated).toContain('<style data-kiditem-template-styles>');
    expect(hydrated.match(/tailwindcss v4\.2\.2/g)).toHaveLength(1);

    const renderedAgain = buildRenderDocument(
      hydrated,
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
    expect(renderedAgain.match(/tailwindcss v4\.2\.2/g)).toHaveLength(1);
  });

  it('does not globally override template image height and crop rules', () => {
    const doc = buildRenderDocument(
      '<img src="hero.jpg" />',
      'http://localhost:4000',
      COMPILED_TEMPLATE_CSS,
    );
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
