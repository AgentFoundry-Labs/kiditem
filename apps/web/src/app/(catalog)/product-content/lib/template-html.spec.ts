import { describe, expect, it } from 'vitest';
import { ensureStyledDetailHtml, repairBoldVerticalEditedHtml } from './template-html';

describe('detail template HTML repair', () => {
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
});
