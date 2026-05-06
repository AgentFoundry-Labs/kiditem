'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { API_BASE } from '@/lib/api';

interface TemplateData {
  title?: string;
  [key: string]: unknown;
}

interface TemplateConfigLike {
  fonts: string[];
  fontFamily: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = React.ComponentType<any>;

const API_BASE_ROOT = API_BASE.replace(/\/$/, '');

function getWebOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function absolutizeFontUrls(css: string): string {
  const webOrigin = getWebOrigin();
  if (!webOrigin) return css;
  return css.replace(/url\(\s*(['"]?)\/fonts\//g, `url($1${webOrigin}/fonts/`);
}

function toApiAssetUrl(value: string): string {
  const url = value.trim();
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return value;
  if (/^\/(?:processed|uploads|api)\//i.test(url)) return `${API_BASE_ROOT}${url}`;
  return value;
}

function normalizeElementUrl(el: Element, attr: string): void {
  const value = el.getAttribute(attr);
  if (!value) return;
  el.setAttribute(attr, toApiAssetUrl(value));
}

function normalizeDocumentAssetUrls(doc: Document): void {
  doc.querySelectorAll('img[src], source[src], video[src]').forEach((el) => {
    normalizeElementUrl(el, 'src');
  });
  doc.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
    normalizeElementUrl(el, 'srcset');
  });
  doc.querySelectorAll('video[poster]').forEach((el) => {
    normalizeElementUrl(el, 'poster');
  });
}

function normalizeEditedHtmlAssets(html: string): string {
  const source = absolutizeFontUrls(html);
  const isFullDocument = /<html[\s>]/i.test(source);
  const startsWithBody = /^<body[\s>]/i.test(source.trim());
  const doc = new DOMParser().parseFromString(source, 'text/html');

  doc.head.querySelectorAll('base').forEach((el) => el.remove());
  doc.head.querySelectorAll('style').forEach((style) => {
    style.textContent = absolutizeFontUrls(style.textContent ?? '');
  });
  normalizeDocumentAssetUrls(doc);

  if (isFullDocument) return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  if (startsWithBody) return doc.body.outerHTML;
  return doc.body.innerHTML;
}

function buildThemeVarsCss(data: TemplateData): string {
  const vars: Record<string, string | undefined> = {
    '--theme-main': data.themeColorMain as string | undefined,
    '--theme-bg-light': data.themeColorBgLight as string | undefined,
    '--theme-badge-1': data.themeColorBadge1 as string | undefined,
    '--theme-badge-2': data.themeColorBadge2 as string | undefined,
    '--theme-section-bg': data.themeSectionBg as string | undefined,
    '--theme-text-primary': data.themeTextPrimary as string | undefined,
    '--theme-text-secondary': data.themeTextSecondary as string | undefined,
    '--theme-radius': data.themeBorderRadius as string | undefined,
  };
  const lines = Object.entries(vars)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${v};`);
  if (lines.length === 0) return '';
  return `:root { ${lines.join(' ')} }`;
}

export function renderTemplateToHtml(
  Component: AnyComponent,
  data: TemplateData,
  config: TemplateConfigLike,
  templateCss = '',
): string {
  const bodyHtml = renderToStaticMarkup(<Component data={data} />);
  const themeVarsCss = buildThemeVarsCss(data);

  const fontLinks = config.fonts
    .map((fontUrl: string) => `<link rel="stylesheet" href="${fontUrl}" />`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.title ?? '상세페이지'}</title>
  <style>${absolutizeFontUrls(templateCss)}</style>
  ${fontLinks}
  <style>
    ${themeVarsCss}
    body {
      margin: 0;
      padding: 0;
      font-family: ${config.fontFamily};
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

function looksLikeTailwindMarkup(html: string): boolean {
  return /class=["'][^"']*(?:\bbg-|\btext-|\bflex\b|\bgrid\b|\bp[trblxy]?-|\bm[trblxy]?-|\bw-|\bh-|\bmax-w-|\bmin-h-|\brounded|\bshadow|\bfont-|\bleading-|\btracking-|\baspect-|\bobject-|\babsolute\b|\brelative\b|\binset-|\bz-)/i.test(html);
}

interface EditedHtmlStyleProfile {
  fontLinks: string[];
  bodyFontFamily: string;
  viewportWidth: number;
}

function inferEditedHtmlStyleProfile(html: string): EditedHtmlStyleProfile {
  if (/\bfont-display\b|data-field=["']hookText["']|data-field=["']sectionTitle["']/i.test(html)) {
    return {
      fontLinks: [
        'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
      ],
      bodyFontFamily: "'Noto Sans KR', system-ui, sans-serif",
      viewportWidth: 860,
    };
  }

  if (/\bmax-w-\[720px\]\b|찐 사용 후기|KeyPoint/i.test(html)) {
    return {
      fontLinks: [
        'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
      ],
      bodyFontFamily: "'Noto Sans KR', system-ui, sans-serif",
      viewportWidth: 720,
    };
  }

  if (/--theme-|bg-\[var\(--theme-/i.test(html)) {
    return {
      fontLinks: [
        'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css',
      ],
      bodyFontFamily: "'Pretendard', system-ui, sans-serif",
      viewportWidth: 860,
    };
  }

  return {
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
    ],
    bodyFontFamily: "'Noto Sans KR', system-ui, sans-serif",
    viewportWidth: 860,
  };
}

const EDITED_HTML_FALLBACK_CSS = `
  :root {
    --theme-main: #ff866d;
    --theme-bg-light: #eef8ff;
    --theme-badge-1: #6ec6ff;
    --theme-badge-2: #68c7ff;
    --theme-section-bg: #fffaf1;
    --theme-text-primary: #44403c;
    --theme-text-secondary: #57534e;
    --theme-radius: 24px;
    --font-display: "Black Han Sans", sans-serif;
    --font-sans: "Noto Sans KR", "Pretendard", system-ui, sans-serif;
  }
  .bg-gradient-to-b { background-image: linear-gradient(to bottom, var(--tw-gradient-stops)); }
  .bg-gradient-to-t { background-image: linear-gradient(to top, var(--tw-gradient-stops)); }
  .from-\\[\\#1a1a1a\\] {
    --tw-gradient-from: #1a1a1a;
    --tw-gradient-to: rgb(26 26 26 / 0);
    --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
  }
  .to-\\[\\#2d2d2d\\] { --tw-gradient-to: #2d2d2d; }
  .from-\\[\\#e1edf9\\] {
    --tw-gradient-from: #e1edf9;
    --tw-gradient-to: rgb(225 237 249 / 0);
    --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
  }
  .from-gray-900 {
    --tw-gradient-from: #111827;
    --tw-gradient-to: rgb(17 24 39 / 0);
    --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
  }
  .from-white {
    --tw-gradient-from: #fff;
    --tw-gradient-to: rgb(255 255 255 / 0);
    --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
  }
  .via-transparent {
    --tw-gradient-to: rgb(0 0 0 / 0);
    --tw-gradient-stops: var(--tw-gradient-from), transparent, var(--tw-gradient-to);
  }
  .to-transparent { --tw-gradient-to: transparent; }
  .to-white { --tw-gradient-to: #fff; }
  .bg-\\[\\#e5e7eb\\] { background-color: #e5e7eb; }
  .bg-\\[\\#dfd9c9\\] { background-color: #dfd9c9; }
  .bg-\\[\\#1e2d4d\\] { background-color: #1e2d4d; }
  .bg-\\[\\#2d3436\\] { background-color: #2d3436; }
  .bg-\\[var\\(--theme-main\\)\\] { background-color: var(--theme-main); }
  .bg-\\[var\\(--theme-bg-light\\)\\] { background-color: var(--theme-bg-light); }
  .bg-\\[var\\(--theme-badge-1\\)\\] { background-color: var(--theme-badge-1); }
  .bg-\\[var\\(--theme-badge-2\\)\\] { background-color: var(--theme-badge-2); }
  .bg-\\[var\\(--theme-section-bg\\)\\] { background-color: var(--theme-section-bg); }
  .text-\\[\\#4a4030\\] { color: #4a4030; }
  .text-\\[var\\(--theme-main\\)\\] { color: var(--theme-main); }
  .text-\\[var\\(--theme-badge-2\\)\\] { color: var(--theme-badge-2); }
  .text-\\[var\\(--theme-text-primary\\)\\] { color: var(--theme-text-primary); }
  .text-\\[var\\(--theme-text-secondary\\)\\] { color: var(--theme-text-secondary); }
  .font-display { font-family: var(--font-display); }
  .rounded-\\[2rem\\] { border-radius: 2rem; }
  .rounded-\\[24px\\] { border-radius: 24px; }
  .rounded-\\[var\\(--theme-radius\\)\\] { border-radius: var(--theme-radius); }
  .rounded-b-\\[4rem\\] { border-bottom-left-radius: 4rem; border-bottom-right-radius: 4rem; }
  .brightness-\\[0\\.7\\] { filter: brightness(0.7); }
  .h-\\[400px\\] { height: 400px; }
  .h-\\[500px\\] { height: 500px; }
  .h-\\[800px\\] { height: 800px; }
  .aspect-\\[21\\/9\\] { aspect-ratio: 21 / 9; }
  .aspect-\\[4\\/3\\] { aspect-ratio: 4 / 3; }
  .aspect-\\[4\\/5\\] { aspect-ratio: 4 / 5; }
  .aspect-\\[3\\/4\\] { aspect-ratio: 3 / 4; }
  .px-6.py-20.text-center.relative.z-10.\\-mt-20 {
    margin-top: -6rem;
    padding-top: 4rem;
    padding-bottom: 4rem;
  }
  .pointer-events-none { pointer-events: none; }
  .h-48 { height: 12rem; }
  .\\-mt-24 { margin-top: -6rem; }
  .pt-16 { padding-top: 4rem; }
  .pb-16 { padding-bottom: 4rem; }
  .relative > img.h-\\[500px\\] + .absolute.inset-0.bg-gradient-to-t.from-white.via-transparent.to-transparent {
    display: none;
  }
  section[class*="from-[#1a1a1a]"] {
    background: linear-gradient(to bottom, #1a1a1a, #2d2d2d) !important;
  }
  section[class*="from-[#1a1a1a]"] .text-white,
  section[class*="from-[#1a1a1a]"] h1 {
    color: #fff !important;
  }
  section[class*="from-[#1a1a1a]"] .text-gray-300 {
    color: #d1d5db !important;
  }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function buildSizeGuideFrameHtml(input: {
  src: string;
  alt: string;
  heightLabel?: string;
  widthLabel?: string;
}): string {
  const src = escapeAttr(input.src);
  const alt = escapeAttr(input.alt);
  const heightLabel = escapeHtml((input.heightLabel ?? '').trim());
  const widthLabel = escapeHtml((input.widthLabel ?? '').trim());
  const hasHeightGuide = heightLabel !== '';
  const hasWidthGuide = widthLabel !== '';
  const imageColumn = hasHeightGuide ? 2 : 1;
  const gridColumns = hasHeightGuide ? '82px minmax(0, max-content)' : 'minmax(0, max-content)';
  const gridRows = hasWidthGuide ? 'auto 78px' : 'auto';
  const heightGuide = hasHeightGuide ? `
        <div aria-hidden="true" style="position:relative;grid-column:1;grid-row:1;align-self:stretch;width:82px;min-height:330px;">
          <span style="position:absolute;top:0;bottom:0;right:8px;width:1.5px;background:#111827;">
            <span style="position:absolute;top:0;left:-13px;width:28px;height:1.5px;background:#111827;display:block;"></span>
            <span style="position:absolute;bottom:0;left:-13px;width:28px;height:1.5px;background:#111827;display:block;"></span>
          </span>
          <span data-field="sizeHeightLabel" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:center;color:#111827;font-size:42px;line-height:1;font-weight:900;white-space:nowrap;">${heightLabel}</span>
        </div>` : '';
  const widthGuide = hasWidthGuide ? `
        <div aria-hidden="true" style="position:relative;grid-column:${imageColumn};grid-row:2;align-self:start;width:100%;min-width:180px;height:72px;margin-top:18px;">
          <span style="position:absolute;left:0;right:0;top:0;height:1.5px;background:#111827;">
            <span style="position:absolute;left:0;top:-13px;width:1.5px;height:28px;background:#111827;display:block;"></span>
            <span style="position:absolute;right:0;top:-13px;width:1.5px;height:28px;background:#111827;display:block;"></span>
          </span>
          <span data-field="sizeWidthLabel" style="position:absolute;left:50%;top:18px;transform:translateX(-50%);color:#111827;font-size:46px;line-height:1;font-weight:900;white-space:nowrap;">${widthLabel}</span>
        </div>` : '';

  return `
    <div data-role="size-guide-frame" style="border-radius:34px;background:#fff;border:1px solid #f1f1f1;box-shadow:0 8px 24px rgba(15,23,42,.08);overflow:hidden;padding:48px 30px 38px;">
      <div style="min-height:520px;display:grid;place-items:center;">
        <div style="display:inline-grid;grid-template-columns:${gridColumns};grid-template-rows:${gridRows};column-gap:${hasHeightGuide ? 22 : 0}px;align-items:stretch;justify-content:center;justify-items:center;max-width:100%;">
          ${heightGuide}
          <img data-field="sizeGuideImage" src="${src}" alt="${alt}" style="grid-column:${imageColumn};grid-row:1;position:relative;z-index:10;display:block;width:auto;max-width:${hasHeightGuide ? 430 : 540}px;max-height:500px;object-fit:contain;" />
          ${widthGuide}
        </div>
      </div>
    </div>
  `;
}

function repairSizeGuideFrameHtml(html: string): string {
  if (!html.includes('data-container="sizeImages"')) {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = doc.querySelector<HTMLElement>('[data-container="sizeImages"]');
  const frame = container?.querySelector<HTMLElement>('[data-role="size-guide-frame"]');
  const img = (frame ?? container)?.querySelector<HTMLImageElement>('img');
  if (!container || !img) return html;
  const heightLabel = (frame ?? container)
    .querySelector<HTMLElement>('[data-field="sizeHeightLabel"]')
    ?.textContent?.trim() ?? '';
  const widthLabel = (frame ?? container)
    .querySelector<HTMLElement>('[data-field="sizeWidthLabel"]')
    ?.textContent?.trim() ?? '';
  const repairedFrame = buildSizeGuideFrameHtml({
    src: img.getAttribute('src') ?? '',
    alt: img.getAttribute('alt') ?? '제품 사이즈',
    heightLabel,
    widthLabel,
  });
  if (frame) {
    frame.outerHTML = repairedFrame;
  } else {
    container.innerHTML = repairedFrame;
  }
  return /<html[\s>]/i.test(html) ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}

function repairProductInfoTableWidthHtml(html: string): string {
  if (!html.includes('data-container="productInfo"')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = doc.querySelector<HTMLElement>('[data-container="productInfo"]');
  if (!container) return html;
  const safetyLabelContainer = doc.querySelector<HTMLElement>('[data-container="safetyLabelImages"]');
  if (safetyLabelContainer?.querySelector('img')) {
    container.remove();
    return /<html[\s>]/i.test(html) ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
  }

  container.style.width = '82%';
  container.style.maxWidth = '500px';
  container.style.marginLeft = 'auto';
  container.style.marginRight = 'auto';
  return /<html[\s>]/i.test(html) ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}

/**
 * GrapesJS 저장본은 body fragment 만 남을 수 있다. 그 경우 Tailwind/template CSS 를
 * 다시 붙여 상세 미리보기와 다음 에디터 진입에서 원래 디자인을 유지한다.
 */
export function ensureStyledDetailHtml(html: string, templateCss = ''): string {
  const source = normalizeEditedHtmlAssets(
    repairProductInfoTableWidthHtml(repairSizeGuideFrameHtml(html.trim())),
  );
  if (!source) return html;

  const profile = inferEditedHtmlStyleProfile(source);
  const hasTailwindRuntime = /cdn\.tailwindcss\.com/i.test(source);
  const hasCompiledTailwind = /tailwindcss v/i.test(source);
  const needsTailwindRuntime =
    looksLikeTailwindMarkup(source) && !hasTailwindRuntime && !hasCompiledTailwind;
  const fontLinks = profile.fontLinks
    .filter((fontUrl) => !source.includes(fontUrl))
    .map((fontUrl) => `<link rel="stylesheet" href="${fontUrl}" />`)
    .join('\n  ');
  const headExtra = `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${profile.viewportWidth}, initial-scale=1" />
  ${needsTailwindRuntime ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
  ${fontLinks}
  ${templateCss ? `<style>${absolutizeFontUrls(templateCss)}</style>` : ''}
  <style>${EDITED_HTML_FALLBACK_CSS}</style>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: ${profile.bodyFontFamily};
      -webkit-font-smoothing: antialiased;
    }
  </style>`;

  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) {
      return source.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${headExtra}`);
    }
    return source.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${headExtra}</head>`);
  }

  const bodyMarkup = /^<body[\s>]/i.test(source) ? source : `<body>${source}</body>`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>${headExtra}</head>
${bodyMarkup}
</html>`;
}
