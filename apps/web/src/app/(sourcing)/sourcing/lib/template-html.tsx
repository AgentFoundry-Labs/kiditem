'use client';

import { renderToStaticMarkup } from 'react-dom/server';

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
  <style>${templateCss}</style>
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

/**
 * GrapesJS 저장본은 body fragment 만 남을 수 있다. 그 경우 Tailwind/template CSS 를
 * 다시 붙여 상세 미리보기와 다음 에디터 진입에서 원래 디자인을 유지한다.
 */
export function ensureStyledDetailHtml(html: string, templateCss = ''): string {
  const source = html.trim();
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
  ${templateCss ? `<style>${templateCss}</style>` : ''}
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
