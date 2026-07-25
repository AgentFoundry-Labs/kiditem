/** Coupang detail-description target width. */
export const COUPANG_DETAIL_IMAGE_WIDTH = 780;
/** Editor preview/download layout width used before output scaling. */
export const COUPANG_DETAIL_LAYOUT_WIDTH = 720;
/** JPEG quality selected for long product-detail pages. */
export const COUPANG_DETAIL_JPEG_QUALITY = 82;

const RENDER_RESET_CSS = `
  html, body { margin: 0; padding: 0; }

  [data-role="package-image-frame"] {
    overflow: hidden !important;
    border-radius: 34px !important;
    border: 1px solid #d8ebf7 !important;
    background: #eaf6ff !important;
    padding: 40px !important;
  }
  [data-role="package-image-frame"] img {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
    border-radius: 24px !important;
    mix-blend-mode: multiply !important;
  }
`;

const TEMPLATE_STYLE_ATTR = 'data-kiditem-template-styles';

function hasCompiledTemplateStyles(html: string): boolean {
  return new RegExp(`<style[^>]+${TEMPLATE_STYLE_ATTR}`, 'i').test(html)
    || /tailwindcss\s+v\d/i.test(html);
}

function escapeStyleText(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

export function detailPageServerOrigin(): string {
  const port = Number(process.env.PORT) || 4000;
  return `http://localhost:${port}`;
}

export function buildRenderDocument(
  html: string,
  baseHref: string,
  compiledTemplateCss: string,
): string {
  const reset = `<style>${RENDER_RESET_CSS}</style>`;
  const templateStyles = hasCompiledTemplateStyles(html)
    ? ''
    : `<style ${TEMPLATE_STYLE_ATTR}>${escapeStyleText(compiledTemplateCss)}</style>`;
  const base = /<base\s/i.test(html) ? '' : `<base href="${baseHref}/" />`;
  if (/<head(\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<head(\s[^>]*)?>/i,
      (match) => `${match}\n${base}\n${templateStyles}\n${reset}`,
    );
  }
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  ${base}
  ${templateStyles}
  ${reset}
</head>
<body>${html}</body>
</html>`;
}
