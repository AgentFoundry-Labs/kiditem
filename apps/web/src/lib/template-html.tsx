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


