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

  it('repairs bold vertical hero title spacing and replaces the loose divider with word underlines', () => {
    const html = `<body>
  <div>
    <div class="py-10" style="min-height: 1800px;">
      <div class="max-w-3xl mx-auto bg-white shadow-2xl" style="height: 1600px;">
        <style>#iwwc{background-color:#dbeafe;min-height:1800px;}#keep{min-height:300px;}</style>
        <section data-section="hero">
          <div class="text-center mt-16 px-4 flex flex-col items-center">
            <p data-field="hookSubtext" class="mb-4 text-2xl">손으로 딸깍!</p>
            <h1 class="font-display text-[80px] md:text-[96px] leading-[1.02]">
              <span data-field="hookText" id="ieo7c">퐁퐁</span><br>
              <span data-field="hookTitleSub" id="ixmpj">슬라임!</span>
            </h1>
            <div class="w-64 h-0.5 bg-[var(--theme-main)] opacity-40 mt-6"></div>
            <div data-field="description" class="mt-6 flex flex-col items-center">설명</div>
          </div>
        </section>
        <section data-section="point">
          <div class="absolute left-1/2 -translate-x-1/2 top-14 w-14 h-14 bg-black text-white rounded-full">
            <span>POINT</span><span>1</span>
          </div>
        </section>
        <div data-container="detailPackageImages">
          <p>1박스 12개입 구성</p>
          <p>박스 구성 확인</p>
          <div><img src="/box.png" alt="박스"></div>
        </div>
        <section data-section="detailImages">
          <div>
            <div>DETAIL</div>
            <div data-container="detailImages">
              <div><img src="/detail.png" alt="디테일"></div>
            </div>
          </div>
        </section>
        <section data-section="specs">
          <div data-container="safetyLabelImages">
            <img src="/barcode.png" alt="바코드">
          </div>
        </section>
        </div>
      </div>
    </div>
  </div>
</body>`;

    const output = repairBoldVerticalEditedHtml(html);
    const doc = new DOMParser().parseFromString(output, 'text/html');
    const hookText = doc.querySelector<HTMLElement>('[data-field="hookText"]');
    const hookTitleSub = doc.querySelector<HTMLElement>('[data-field="hookTitleSub"]');
    const separator = doc.querySelector('.w-64.h-0\\.5');
    const description = doc.querySelector<HTMLElement>('[data-field="description"]');
    const pointBadge = doc.querySelector<HTMLElement>('[data-role="point-droplet"]');
    const pointIcon = doc.querySelector<SVGElement>('[data-role="point-droplet-icon"]');
    const outerFrame = doc.querySelector<HTMLElement>('body > div > div');
    const innerFrame = doc.querySelector<HTMLElement>('body > div > div > div');
    const packageLabels = Array.from(doc.querySelectorAll('[data-container="detailPackageImages"] p'))
      .map((el) => el.textContent);
    const detailDescription = doc.querySelector<HTMLElement>('[data-field="detailDescription"]');
    const packageImageFrame = doc.querySelector<HTMLElement>('[data-role="package-image-frame"]');
    const safetyLabelFrame = doc.querySelector<HTMLElement>('[data-role="safety-label-frame"]');

    expect(outerFrame?.className).not.toContain('py-10');
    expect(outerFrame?.style.paddingTop).toBe('0px');
    expect(outerFrame?.style.minHeight).toBe('');
    expect(innerFrame?.className).not.toContain('max-w-3xl');
    expect(innerFrame?.className).not.toContain('shadow-2xl');
    expect(innerFrame?.className).toContain('w-full');
    expect(innerFrame?.style.maxWidth).toBe('none');
    expect(innerFrame?.style.boxShadow).toBe('none');
    expect(innerFrame?.style.height).toBe('');
    expect(output).not.toContain('min-height:1800px');
    expect(output).toContain('min-height:300px');
    expect(hookText?.style.textDecorationLine).toBe('underline');
    expect(hookText?.style.paddingTop).toBe('6px');
    expect(hookTitleSub?.textContent).toBe('슬라임');
    expect(hookTitleSub?.style.marginTop).toBe('0px');
    expect(hookTitleSub?.style.textDecorationLine).toBe('underline');
    expect(separator).toBeNull();
    expect(description?.className).toContain('mt-5');
    expect(pointBadge?.className).not.toContain('rounded-full');
    expect(pointBadge?.className).not.toContain('w-14');
    expect(pointBadge?.className).toContain('mx-auto');
    expect(pointBadge?.style.width).toBe('104px');
    expect(pointBadge?.style.height).toBe('122px');
    expect(pointBadge?.querySelectorAll('span')[0]?.style.marginTop).toBe('12px');
    expect(pointBadge?.querySelectorAll('span')[1]?.style.marginTop).toBe('10px');
    expect(pointIcon).not.toBeNull();
    expect(pointIcon?.getAttribute('viewBox')).toBe('0 0 256 256');
    expect(packageLabels).toEqual(['1BOX 12개입 구성', '세트 구매시 참고']);
    expect(detailDescription?.textContent).toBe('퐁퐁 슬라임의 디테일 이미지입니다.');
    expect(packageImageFrame?.style.background).toBe('rgb(234, 246, 255)');
    expect(packageImageFrame?.querySelector('img')?.getAttribute('style') ?? '').toContain('mix-blend-mode: multiply');
    expect(safetyLabelFrame?.style.background).toBe('rgb(143, 162, 207)');
    expect(safetyLabelFrame?.querySelector('img')?.getAttribute('style') ?? '').toContain('border: 1px solid rgba(0, 0, 0, 0.2)');
  });
});
