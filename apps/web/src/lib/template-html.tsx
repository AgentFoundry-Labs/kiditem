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

export function renderTemplateToHtml(
  Component: AnyComponent,
  data: TemplateData,
  config: TemplateConfigLike,
  templateCss = '',
): string {
  const bodyHtml = renderToStaticMarkup(<Component data={data} />);

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


