import { describe, expect, it } from 'vitest';
import {
  ensureStyledDetailHtml,
  isRenderableDetailHtml,
  repairBoldVerticalEditedHtml,
} from './template-html';

describe('sourcing detail template HTML repair', () => {
  it('keeps a saved editor gradient from component CSS instead of writing the default title gradient inline', () => {
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <style>
    @media (max-width: 720px) {
      #ieo7c {
        background-image: linear-gradient(90deg, #7c3aed 0%, #db2777 100%);
        background-clip: text;
        -webkit-background-clip: text;
        color: transparent;
        -webkit-text-fill-color: transparent;
      }
    }
  </style>
</head>
<body>
  <h1>
    <span data-field="hookText" id="ieo7c">퐁퐁</span>
    <span data-field="hookTitleSub" id="ixmpj">슬라임!</span>
  </h1>
</body>
</html>`;

    const output = ensureStyledDetailHtml(html, '');
    const doc = new DOMParser().parseFromString(output, 'text/html');
    const hookText = doc.querySelector<HTMLElement>('[data-field="hookText"]');

    expect(output).toContain('#7c3aed');
    expect(hookText?.getAttribute('style') ?? '').not.toContain('var(--theme-badge-2)');
  });

  it('keeps a saved inline editor gradient on bold vertical title text', () => {
    const html = `<body>
  <span
    data-field="hookText"
    id="ieo7c"
    style="background-image:linear-gradient(90deg, #2563eb 0%, #06b6d4 100%);color:transparent"
  >퐁퐁</span>
</body>`;

    const output = repairBoldVerticalEditedHtml(html);
    const doc = new DOMParser().parseFromString(output, 'text/html');
    const hookText = doc.querySelector<HTMLElement>('[data-field="hookText"]');
    const style = hookText?.getAttribute('style') ?? '';

    expect(style).toContain('rgb(37, 99, 235)');
    expect(style).not.toContain('var(--theme-badge-2)');
  });

  it('does not treat stored JSON payloads as renderable editor HTML', () => {
    expect(isRenderableDetailHtml('{"result":{"title":"stored json"}}')).toBe(false);
    expect(isRenderableDetailHtml('[{"html":"not a document"}]')).toBe(false);
    expect(isRenderableDetailHtml('<section>상세페이지</section>')).toBe(true);
    expect(isRenderableDetailHtml('<!doctype html><html><body>상세페이지</body></html>')).toBe(true);
  });

  it('does not duplicate the font-ready head when a saved full document already has it', () => {
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <style data-kiditem-font-ready-gate>html.kiditem-font-ready body { opacity: 1; }</style>
  <style>/*! tailwindcss v4.0.0 */ .text-red-500 { color: red; }</style>
</head>
<body><section class="text-red-500">저장본</section></body>
</html>`;

    const output = ensureStyledDetailHtml(html, '/*! tailwindcss v4.0.0 */ .text-red-500 { color: red; }');

    expect(output.match(/data-kiditem-font-ready-gate/g)).toHaveLength(1);
  });
});
