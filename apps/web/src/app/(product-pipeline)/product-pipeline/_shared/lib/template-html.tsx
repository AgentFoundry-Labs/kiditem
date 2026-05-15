'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { API_BASE } from '@/lib/api';
import { buildSizeGuideFrameHtml } from './size-guide-frame';

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
const FONT_READY_GATE_ATTR = 'data-kiditem-font-ready-gate';

function getWebOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function absolutizeFontUrls(css: string): string {
  const webOrigin = getWebOrigin();
  if (!webOrigin) return css;
  return css.replace(/url\(\s*(['"]?)\/fonts\//g, `url($1${webOrigin}/fonts/`);
}

function normalizeFontDisplayPolicy(css: string): string {
  return css.replace(/font-display:\s*swap\s*;/gi, 'font-display: block;');
}

function prepareTemplateCss(css: string): string {
  return normalizeFontDisplayPolicy(absolutizeFontUrls(css));
}

export function toFontDisplayBlockUrl(fontUrl: string): string {
  if (!/fonts\.googleapis\.com/i.test(fontUrl)) return fontUrl;
  try {
    const url = new URL(fontUrl);
    url.searchParams.set('display', 'block');
    return url.toString();
  } catch {
    return fontUrl.replace(/([?&]display=)swap\b/i, '$1block');
  }
}

export function buildDetailFontReadyGateHead(): string {
  return `<style ${FONT_READY_GATE_ATTR}>
    html.kiditem-font-loading body {
      opacity: 0;
    }
    html.kiditem-font-ready body {
      opacity: 1;
      transition: opacity 120ms ease-out;
    }
    @media (prefers-reduced-motion: reduce) {
      html.kiditem-font-ready body {
        transition: none;
      }
    }
    @media print {
      html.kiditem-font-loading body {
        opacity: 1;
      }
    }
  </style>
  <script ${FONT_READY_GATE_ATTR}>
    (function () {
      var root = document.documentElement;
      if (!root || root.dataset.kiditemFontGate === 'ready') return;
      root.classList.add('kiditem-font-loading');
      var done = false;
      function reveal() {
        if (done) return;
        done = true;
        root.classList.remove('kiditem-font-loading');
        root.classList.add('kiditem-font-ready');
        root.dataset.kiditemFontGate = 'ready';
      }
      function revealAfterPaint() {
        var raf = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 16); };
        raf(function () { raf(reveal); });
      }
      var timeout = window.setTimeout(reveal, 2500);
      function finish() {
        window.clearTimeout(timeout);
        revealAfterPaint();
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(finish).catch(reveal);
      } else if (document.readyState === 'complete') {
        finish();
      } else {
        window.addEventListener('load', finish, { once: true });
      }
    })();
  </script>`;
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
  const source = prepareTemplateCss(html);
  const isFullDocument = /<html[\s>]/i.test(source);
  const startsWithBody = /^<body[\s>]/i.test(source.trim());
  const doc = new DOMParser().parseFromString(source, 'text/html');

  doc.head.querySelectorAll('base').forEach((el) => el.remove());
  doc.head.querySelectorAll('style').forEach((style) => {
    style.textContent = prepareTemplateCss(style.textContent ?? '');
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
    .map((fontUrl: string) => `<link rel="stylesheet" href="${toFontDisplayBlockUrl(fontUrl)}" />`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.title ?? '상세페이지'}</title>
  <style>${prepareTemplateCss(templateCss)}</style>
  ${fontLinks}
  ${buildDetailFontReadyGateHead()}
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
        'https://hangeul.pstatic.net/hangeul_static/css/nanum-pen.css',
      ],
      bodyFontFamily: "'NanumSquareRoundLocal', 'Noto Sans KR', sans-serif",
      viewportWidth: 860,
    };
  }

  if (/\bmax-w-\[720px\]\b|찐 사용 후기|KeyPoint/i.test(html)) {
    return {
      fontLinks: [
        'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=block',
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
      'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=block',
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
    --font-display: "Jalnan2Local", "NanumSquareRoundLocal", "NanumSquareNeoHeavy", "NanumSquareNeoExtraBold", sans-serif;
    --font-sans: "NanumSquareRoundLocal", "Noto Sans KR", "Pretendard", system-ui, sans-serif;
  }
  @font-face {
    font-family: "Jalnan2Local";
    src: url("/fonts/jalnan2/Jalnan2TTF.ttf") format("truetype");
    font-weight: 400 900;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "NanumPen";
    src: url("https://hangeul.pstatic.net/hangeul_static/webfont/NanumBrush/NanumPen.woff") format("woff"),
      url("https://hangeul.pstatic.net/hangeul_static/webfont/NanumBrush/NanumPen.ttf") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: block;
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

function serializeEditedHtmlDocument(doc: Document, originalHtml: string): string {
  if (/<html[\s>]/i.test(originalHtml)) return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  if (/^<body[\s>]/i.test(originalHtml.trim())) return doc.body.outerHTML;
  return doc.body.innerHTML;
}

function setStyleProperties(el: HTMLElement, styles: Record<string, string>): void {
  for (const [key, value] of Object.entries(styles)) {
    el.style.setProperty(key, value);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasDocumentStyleProperty(el: HTMLElement, property: string): boolean {
  const id = el.getAttribute('id');
  if (!id) return false;
  const pattern = new RegExp(`#${escapeRegExp(id)}\\s*\\{[^}]*${escapeRegExp(property)}\\s*:`, 'i');
  return Array.from(el.ownerDocument.querySelectorAll('style')).some((style) =>
    pattern.test(style.textContent ?? ''),
  );
}

function setMissingStyleProperties(el: HTMLElement, styles: Record<string, string>): void {
  for (const [key, value] of Object.entries(styles)) {
    if (el.style.getPropertyValue(key) || hasDocumentStyleProperty(el, key)) continue;
    el.style.setProperty(key, value);
  }
}

const BOLD_VERTICAL_TITLE_UNDERLINE_STYLE = {
  'padding-top': '6px',
  'line-height': '1.08',
  'text-decoration-line': 'underline',
  'text-decoration-color': 'rgba(196, 178, 150, 0.78)',
  'text-decoration-thickness': '1.5px',
  'text-underline-offset': '4px',
  'text-decoration-skip-ink': 'none',
  display: 'inline-block',
} satisfies Record<string, string>;

const BOLD_VERTICAL_TITLE_BOUNDS_STYLE = {
  'padding-top': '6px',
  'line-height': '1.08',
  display: 'inline-block',
} satisfies Record<string, string>;

const POINT_DROPLET_ICON_SVG = `
<svg aria-hidden="true" data-role="point-droplet-icon" viewBox="0 0 256 256" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%;color:#000;">
  <path d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75Z" fill="currentColor"></path>
</svg>`;

function stripTrailingBang(value: string): string {
  return value.replace(/[!！]+$/u, '').trim();
}

function softenTrailingBang(value: string): string {
  return value.replace(/[!！]+$/u, '~').trim();
}

function removeClassNames(el: Element, classNames: string[]): void {
  const nextClassNames = new Set((el.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
  classNames.forEach((className) => nextClassNames.delete(className));
  el.setAttribute('class', Array.from(nextClassNames).join(' '));
}

function addClassNames(el: Element, classNames: string[]): void {
  const nextClassNames = new Set((el.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
  classNames.forEach((className) => nextClassNames.add(className));
  el.setAttribute('class', Array.from(nextClassNames).join(' '));
}

function parseCssPixelLength(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : null;
}

function stripLargeGeneratedHeightCss(css: string): string {
  return css.replace(
    /\b(min-height|height)\s*:\s*(-?\d+(?:\.\d+)?)px\s*;?/gi,
    (full, property: string, rawValue: string) => {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return full;
      if (property.toLowerCase() === 'min-height' && value >= 720) return '';
      if (property.toLowerCase() === 'height' && value >= 1200) return '';
      return full;
    },
  );
}

function removeLargeHeightArtifacts(el: HTMLElement, allowHeightRemoval: boolean): void {
  const minHeight = parseCssPixelLength(el.style.minHeight);
  if (minHeight !== null && minHeight >= 720) {
    el.style.removeProperty('min-height');
  }

  const height = parseCssPixelLength(el.style.height);
  if (allowHeightRemoval && height !== null && height >= 1200) {
    el.style.removeProperty('height');
  }
}

function trimBoldVerticalHeightArtifacts(doc: Document): void {
  doc.querySelectorAll<HTMLStyleElement>('style').forEach((style) => {
    const text = style.textContent ?? '';
    const next = stripLargeGeneratedHeightCss(text);
    if (next !== text) style.textContent = next;
  });

  const candidates = new Set<HTMLElement>();
  [doc.documentElement, doc.body].forEach((el) => candidates.add(el));
  Array.from(doc.body.children).forEach((el) => {
    if (el instanceof HTMLElement) candidates.add(el);
  });
  doc.querySelectorAll<HTMLElement>('[data-section], [data-container]').forEach((el) => {
    candidates.add(el);
    let parent = el.parentElement;
    while (parent && parent !== doc.body) {
      candidates.add(parent);
      parent = parent.parentElement;
    }
  });

  candidates.forEach((el) => {
    const isRootish = el === doc.documentElement || el === doc.body || el.parentElement === doc.body;
    const containsSection = el.querySelector('[data-section]') !== null;
    removeLargeHeightArtifacts(el, isRootish || containsSection);
  });
}

function replaceBoldVerticalPackageText(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('p, span, strong').forEach((el) => {
    const text = el.textContent?.trim();
    if (text === '박스 구성 확인') {
      el.textContent = '세트 구매시 참고';
      return;
    }
    if (!text) return;
    if (/^1\s*박스/u.test(text)) {
      el.textContent = text.replace(/^1\s*박스/u, '1BOX');
    }
  });
}

function inferBoldVerticalProductName(doc: Document): string {
  const subtitle = doc
    .querySelector<HTMLElement>('[data-field="sectionSubtitle"]')
    ?.textContent
    ?.replace(/\s+/g, ' ')
    .trim();
  if (subtitle) {
    const match = subtitle.match(/^(.+?)의\s*상품정보/u);
    if (match?.[1]) return stripTrailingBang(match[1].trim());
  }

  const name = [
    doc.querySelector<HTMLElement>('[data-field="sectionName"]')?.textContent?.trim(),
    doc.querySelector<HTMLElement>('[data-field="sectionTitle"]')?.textContent?.trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (name) return stripTrailingBang(name);

  const heroName = [
    doc.querySelector<HTMLElement>('[data-field="hookText"]')?.textContent?.trim(),
    doc.querySelector<HTMLElement>('[data-field="hookTitleSub"]')?.textContent?.trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripTrailingBang(heroName || '상품');
}

function ensureBoldVerticalDetailDescription(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('[data-section="detailImages"]').forEach((section) => {
    if (section.querySelector('[data-field="detailDescription"]')) return;

    const detailBadge = Array.from(section.querySelectorAll<HTMLElement>('div, span, p'))
      .find((el) => el.textContent?.trim() === 'DETAIL');
    if (!detailBadge) return;

    const description = doc.createElement('p');
    description.setAttribute('data-field', 'detailDescription');
    description.setAttribute('class', 'mt-4 text-[#111827] font-bold text-xl md:text-2xl');
    description.textContent = `${inferBoldVerticalProductName(doc)}의 디테일 이미지입니다.`;
    setStyleProperties(description, {
      'margin-top': '16px',
      color: '#111827',
      'font-weight': '700',
      'font-size': '24px',
      'line-height': '1.35',
    });

    detailBadge.insertAdjacentElement('afterend', description);
  });
}

function repairBoldVerticalImageFrames(doc: Document): void {
  doc.querySelectorAll<HTMLImageElement>('[data-container="detailPackageImages"] img')
    .forEach((img) => {
      let frame = img.closest<HTMLElement>('[data-role="package-image-frame"]');
      if (!frame) {
        const parent = img.parentElement;
        if (!parent) return;
        frame = parent;
        frame.setAttribute('data-role', 'package-image-frame');
      }

      addClassNames(frame, ['overflow-hidden']);
      setStyleProperties(frame, {
        overflow: 'hidden',
        'border-radius': '34px',
        border: '1px solid #d8ebf7',
        background: '#eaf6ff',
        padding: '40px',
      });
      setStyleProperties(img, {
        display: 'block',
        width: '100%',
        height: 'auto',
        'object-fit': 'contain',
        'border-radius': '24px',
        'mix-blend-mode': 'multiply',
      });
    });

  doc.querySelectorAll<HTMLImageElement>('[data-container="safetyLabelImages"] img')
    .forEach((img) => {
      if (!img.closest('[data-role="safety-label-frame"]')) {
        const outer = doc.createElement('div');
        outer.setAttribute('data-role', 'safety-label-frame');
        const inner = doc.createElement('div');
        inner.setAttribute('data-role', 'safety-label-inner');
        img.parentElement?.insertBefore(outer, img);
        outer.appendChild(inner);
        inner.appendChild(img);
      }

      const outer = img.closest<HTMLElement>('[data-role="safety-label-frame"]');
      const inner = img.closest<HTMLElement>('[data-role="safety-label-inner"]') ?? img.parentElement;
      if (outer) {
        setStyleProperties(outer, {
          'border-radius': '44px',
          background: '#8fa2cf',
          padding: '36px',
        });
      }
      if (inner) {
        setStyleProperties(inner, {
          'border-radius': '34px',
          background: '#fff',
          padding: '40px',
        });
      }
      setStyleProperties(img, {
        display: 'block',
        width: '100%',
        height: 'auto',
        background: '#fff',
        border: '1px solid rgba(0, 0, 0, 0.2)',
      });
    });
}

function repairBoldVerticalDocumentStyles(doc: Document): void {
  trimBoldVerticalHeightArtifacts(doc);
  replaceBoldVerticalPackageText(doc);
  ensureBoldVerticalDetailDescription(doc);
  repairBoldVerticalImageFrames(doc);

  doc.querySelectorAll<HTMLElement>('body > div > div.py-10')
    .forEach((el) => {
      removeClassNames(el, ['py-10']);
      setStyleProperties(el, {
        'padding-top': '0',
        'padding-bottom': '0',
      });
    });

  doc.querySelectorAll<HTMLElement>('body > div > div > div.max-w-3xl')
    .forEach((el) => {
      removeClassNames(el, ['max-w-3xl', 'mx-auto', 'shadow-2xl']);
      addClassNames(el, ['w-full']);
      setStyleProperties(el, {
        width: '100%',
        'max-width': 'none',
        'margin-left': '0',
        'margin-right': '0',
        'box-shadow': 'none',
      });
    });

  doc.querySelectorAll<HTMLElement>('[data-field="hookText"], [data-field="sectionName"]')
    .forEach((el) => {
      setMissingStyleProperties(el, {
        'background-image': 'linear-gradient(90deg, var(--theme-badge-2) 0%, #596783 52%, var(--theme-badge-1) 100%)',
        'background-clip': 'text',
        '-webkit-background-clip': 'text',
        color: 'transparent',
        'font-family': 'var(--font-display)',
        'font-weight': '900',
      });
    });

  doc.querySelectorAll<HTMLElement>('[data-field="hookText"]')
    .forEach((el) => {
      setStyleProperties(el, BOLD_VERTICAL_TITLE_UNDERLINE_STYLE);
    });

  doc.querySelectorAll<HTMLElement>('[data-field="sectionName"]')
    .forEach((el) => {
      setStyleProperties(el, BOLD_VERTICAL_TITLE_BOUNDS_STYLE);
    });

  doc.querySelectorAll<HTMLElement>('[data-field="hookTitleSub"]')
    .forEach((el) => {
      el.textContent = stripTrailingBang(el.textContent ?? '');
      setStyleProperties(el, {
        ...BOLD_VERTICAL_TITLE_UNDERLINE_STYLE,
        'margin-top': '0',
      });
    });

  doc.querySelectorAll<HTMLElement>('[data-field="sectionTitle"]')
    .forEach((el) => {
      el.textContent = stripTrailingBang(el.textContent ?? '');
    });

  doc.querySelectorAll<HTMLElement>('[data-field="hookTitleSub"], [data-field="sectionTitle"]')
    .forEach((el) => {
      setMissingStyleProperties(el, {
        color: '#111827',
        'font-family': 'var(--font-display)',
        'font-weight': '900',
      });
    });

  doc.querySelectorAll<HTMLElement>('h1.font-display, h2.font-display')
    .forEach((el) => {
      setMissingStyleProperties(el, {
        'font-family': 'var(--font-display)',
      });
      setStyleProperties(el, { 'line-height': '1.08' });
    });

  doc.querySelectorAll<HTMLElement>('section[data-section="point"] h2.font-display')
    .forEach((el) => {
      setStyleProperties(el, { 'line-height': '1.02' });
    });

  doc.querySelectorAll<HTMLElement>('h1.font-display')
    .forEach((heading) => {
      const separator = heading.nextElementSibling;
      const className = separator?.getAttribute('class') ?? '';
      if (
        separator?.nodeType === Node.ELEMENT_NODE &&
        /\bw-64\b/.test(className) &&
        /\bh-0\.5\b/.test(className) &&
        /bg-\[var\(--theme-main\)\]/.test(className)
      ) {
        separator.remove();
      }

      const description = heading.nextElementSibling;
      if (description?.nodeType === Node.ELEMENT_NODE && description.getAttribute('data-field') === 'description') {
        const descriptionClasses = new Set((description.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
        descriptionClasses.delete('mt-6');
        descriptionClasses.delete('mt-7');
        descriptionClasses.add('mt-5');
        descriptionClasses.delete('text-[var(--theme-text-primary)]');
        descriptionClasses.add('text-[#111827]');
        description.setAttribute('class', Array.from(descriptionClasses).join(' '));
        const feature = description.querySelector<HTMLElement>('p:first-child');
        if (feature) {
          feature.textContent = softenTrailingBang(feature.textContent ?? '');
          setStyleProperties(feature, { color: '#111827' });
        }
        description.querySelectorAll<HTMLElement>('p').forEach((paragraph) => {
          if (!(paragraph.textContent ?? '').includes('이미지와 제품의 구성품은 실제와 다를 수 있습니다')) return;
          const noticeClasses = new Set((paragraph.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
          noticeClasses.delete('py-4');
          noticeClasses.add('py-3');
          paragraph.setAttribute('class', Array.from(noticeClasses).join(' '));
        });
      }
    });

  doc.querySelectorAll<HTMLElement>('[data-field="hookSubtext"]')
    .forEach((el) => {
      setMissingStyleProperties(el, {
        'font-family': 'NanumPen, cursive',
        transform: 'rotate(-4deg)',
        'text-underline-offset': '5px',
        'text-decoration-line': 'underline',
        'text-decoration-color': 'var(--theme-main)',
        'text-decoration-thickness': '2px',
      });
      const classNames = new Set((el.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
      classNames.delete('mb-4');
      classNames.add('mb-3');
      el.setAttribute('class', Array.from(classNames).join(' '));
    });

  doc.querySelectorAll<HTMLElement>('section[data-section="point"] > div')
    .forEach((el) => {
      if (!(el.textContent ?? '').includes('POINT')) return;
      const section = el.closest<HTMLElement>('section[data-section="point"]');
      if (section) setStyleProperties(section, { 'padding-top': '10rem' });
      const classNames = new Set((el.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
      classNames.delete('rounded-full');
      classNames.delete('absolute');
      classNames.delete('left-1/2');
      classNames.delete('-translate-x-1/2');
      classNames.delete('top-14');
      classNames.delete('w-14');
      classNames.delete('h-14');
      classNames.delete('bg-black');
      classNames.delete('shadow-lg');
      classNames.add('relative');
      classNames.add('mx-auto');
      el.setAttribute('class', Array.from(classNames).join(' '));
      el.setAttribute('data-role', 'point-droplet');
      setStyleProperties(el, {
        position: 'relative',
        width: '104px',
        height: '122px',
        color: '#000',
        background: 'transparent',
        'box-shadow': 'none',
        filter: 'none',
      });
      if (!el.querySelector('[data-role="point-droplet-icon"]')) {
        el.insertAdjacentHTML('afterbegin', POINT_DROPLET_ICON_SVG);
      } else {
        el.querySelector('[data-role="point-droplet-icon"]')?.remove();
        el.insertAdjacentHTML('afterbegin', POINT_DROPLET_ICON_SVG);
      }
      el.querySelectorAll<HTMLElement>('span').forEach((span, index) => {
        setStyleProperties(span, {
          position: 'relative',
          'z-index': '1',
          color: '#fff',
          'line-height': '1',
        });
        if (index === 0) {
          setStyleProperties(span, {
            'font-size': '10px',
            'font-weight': '700',
            'letter-spacing': '0.12em',
            'margin-top': '12px',
          });
        } else if (index === 1) {
          setStyleProperties(span, {
            'font-size': '24px',
            'font-family': 'var(--font-display)',
            'margin-top': '10px',
          });
        }
      });
      const content = el.nextElementSibling;
      if (content?.nodeType === Node.ELEMENT_NODE) {
        const contentClasses = new Set((content.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
        contentClasses.delete('pt-24');
        contentClasses.delete('mt-6');
        contentClasses.delete('mt-5');
        contentClasses.delete('mt-2');
        contentClasses.add('mt-0');
        content.setAttribute('class', Array.from(contentClasses).join(' '));
        (content as HTMLElement).style.removeProperty('padding-top');
        content.querySelectorAll<HTMLElement>('[data-field="sectionTitle"]').forEach((sectionTitle) => {
          const sectionTitleClasses = new Set((sectionTitle.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
          sectionTitleClasses.delete('mt-2');
          sectionTitleClasses.add('mt-0');
          sectionTitle.setAttribute('class', Array.from(sectionTitleClasses).join(' '));
        });
        content.querySelectorAll<HTMLElement>('[data-field="sectionSubtitle"]').forEach((subtitle) => {
          const subtitleClasses = new Set((subtitle.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
          subtitleClasses.delete('mt-8');
          subtitleClasses.add('mt-5');
          subtitleClasses.delete('text-[var(--theme-text-secondary)]');
          subtitleClasses.delete('text-lg');
          subtitleClasses.delete('md:text-xl');
          subtitleClasses.add('text-[#111827]');
          subtitleClasses.add('text-xl');
          subtitleClasses.add('md:text-2xl');
          subtitle.setAttribute('class', Array.from(subtitleClasses).join(' '));
          setStyleProperties(subtitle, { color: '#111827' });
        });
      }
    });

  doc.querySelectorAll<HTMLElement>('[data-section="sizeImages"] > div > p')
    .forEach((paragraph) => {
      const classes = new Set((paragraph.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
      classes.delete('mt-6');
      classes.add('mt-4');
      classes.delete('text-[var(--theme-text-primary)]');
      classes.delete('text-lg');
      classes.delete('md:text-xl');
      classes.add('text-[#111827]');
      classes.add('text-xl');
      classes.add('md:text-2xl');
      paragraph.setAttribute('class', Array.from(classes).join(' '));
      setStyleProperties(paragraph, { color: '#111827' });
    });

  doc.querySelectorAll<HTMLImageElement>('img[data-field="heroImage"]')
    .forEach((img) => {
      setStyleProperties(img, {
        display: 'block',
        width: '100%',
        'max-width': 'none',
        height: '100%',
        'object-fit': 'cover',
        'margin-left': '0',
        'margin-right': '0',
        'mix-blend-mode': 'normal',
      });
      const classNames = new Set((img.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
      classNames.delete('h-auto');
      classNames.delete('object-contain');
      ['block', 'h-full', 'w-full', 'max-w-none', 'object-cover'].forEach((className) => {
        classNames.add(className);
      });
      img.setAttribute('class', Array.from(classNames).join(' '));
      const parent = img.parentElement;
      if (parent) {
        setStyleProperties(parent, {
          display: 'block',
          height: '560px',
          overflow: 'hidden',
          'background-color': '#fff',
        });
        const parentClassNames = new Set((parent.getAttribute('class') ?? '').split(/\s+/u).filter(Boolean));
        ['flex', 'items-center', 'justify-center', 'h-[520px]', 'md:h-[580px]'].forEach((className) => {
          parentClassNames.delete(className);
        });
        ['h-[560px]', 'md:h-[640px]', 'overflow-hidden', 'bg-white'].forEach((className) => {
          parentClassNames.add(className);
        });
        parent.setAttribute('class', Array.from(parentClassNames).join(' '));
      }
    });
}

export function repairBoldVerticalEditedHtml(html: string): string {
  if (!/data-field=["'](?:hookText|hookTitleSub|sectionName|sectionTitle|hookSubtext|heroImage)["']/.test(html)) {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  repairBoldVerticalDocumentStyles(doc);
  return serializeEditedHtmlDocument(doc, html);
}

function stripLegacyTemplateStyleMixing(html: string): string {
  if (!/<html[\s>]/i.test(html) && !/<head[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.head.querySelectorAll('script[src]').forEach((script) => {
    const src = script.getAttribute('src') ?? '';
    if (/cdn\.tailwindcss\.com/i.test(src)) script.remove();
  });
  doc.head.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    if (/Black\+Han\+Sans|Black\s*Han\s*Sans/i.test(href)) link.remove();
  });
  doc.head.querySelectorAll('style').forEach((style) => {
    const text = style.textContent ?? '';
    const isLegacyFallback =
      text.includes('section[class*="from-[#1a1a1a]"]') ||
      text.includes('relative > img.h-\\[500px\\]') ||
      text.includes('.brightness-\\[0\\.7\\]');
    if (/Black\s*Han\s*Sans/i.test(text) || isLegacyFallback) style.remove();
  });
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

/**
 * GrapesJS 저장본은 body fragment 만 남을 수 있다. 그 경우 Tailwind/template CSS 를
 * 다시 붙여 상세 미리보기와 다음 에디터 진입에서 원래 디자인을 유지한다.
 */
export function ensureStyledDetailHtml(html: string, templateCss = ''): string {
  const baseSource = normalizeEditedHtmlAssets(
    repairBoldVerticalEditedHtml(
      repairProductInfoTableWidthHtml(repairSizeGuideFrameHtml(html.trim())),
    ),
  );
  if (!baseSource) return html;

  const compiledTemplateCss = prepareTemplateCss(templateCss);
  const hasTemplateCss = compiledTemplateCss.trim() !== '';
  const source = hasTemplateCss ? stripLegacyTemplateStyleMixing(baseSource) : baseSource;
  const profile = inferEditedHtmlStyleProfile(source);
  const hasTailwindRuntime = /cdn\.tailwindcss\.com/i.test(source);
  const hasCompiledTailwind =
    /tailwindcss v/i.test(source) || /tailwindcss v/i.test(compiledTemplateCss);
  const sourceAlreadyHasStyledHead =
    /<head[\s>]/i.test(source) &&
    /data-kiditem-font-ready-gate/i.test(source) &&
    (!hasTemplateCss || /tailwindcss v/i.test(source));
  if (sourceAlreadyHasStyledHead) return source;

  const needsTailwindRuntime =
    looksLikeTailwindMarkup(source) &&
    !hasTailwindRuntime &&
    !hasCompiledTailwind &&
    !hasTemplateCss;
  const fontLinks = profile.fontLinks
    .map(toFontDisplayBlockUrl)
    .filter((fontUrl) => !source.includes(fontUrl))
    .map((fontUrl) => `<link rel="stylesheet" href="${fontUrl}" />`)
    .join('\n  ');
  const headExtra = `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${profile.viewportWidth}, initial-scale=1" />
  ${needsTailwindRuntime ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
  ${fontLinks}
  ${hasTemplateCss ? `<style>${compiledTemplateCss}</style>` : ''}
  ${hasTemplateCss ? '' : `<style>${EDITED_HTML_FALLBACK_CSS}</style>`}
  ${buildDetailFontReadyGateHead()}
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
      return source.replace(/<\/head>/i, `${headExtra}\n</head>`);
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

export function isRenderableDetailHtml(html: string | null | undefined): html is string {
  const source = html?.trim();
  if (!source) return false;
  if (source.startsWith('{') || source.startsWith('[')) return false;
  return (
    /^<!doctype\s+html/i.test(source) ||
    /^<html[\s>]/i.test(source) ||
    /^<body[\s>]/i.test(source) ||
    /<\/?[a-z][\s\S]*>/i.test(source)
  );
}
