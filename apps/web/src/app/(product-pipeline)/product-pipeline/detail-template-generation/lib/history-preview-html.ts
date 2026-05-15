import {
  stripSrcDocScripts,
  withDetailPreviewBridge,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/preview-sandbox';

export const HISTORY_PREVIEW_VIEWPORT_WIDTH = 720;

export const HISTORY_PREVIEW_CANVAS_STYLE = `
<style data-kiditem-history-preview-canvas>
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    min-width: 100% !important;
    overflow-x: hidden !important;
    scrollbar-width: none !important;
    background: #ffffff;
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
  }
  body > div:first-child,
  body > main:first-child,
  body > section:first-child,
  body > div:first-child > div:first-child,
  body > div:first-child > div:first-child > div:first-child {
    width: 100% !important;
    max-width: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
</style>`;

export const HISTORY_PREVIEW_MODAL_STYLE = `
  [data-history-preview-scroll] {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  [data-history-preview-scroll]::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
`;

export function buildHistoryPreviewHtml(html: string): string {
  const stripped = stripSrcDocScripts(html);
  const withCanvasStyle = /<\/head\s*>/i.test(stripped)
    ? stripped.replace(/<\/head\s*>/i, `${HISTORY_PREVIEW_CANVAS_STYLE}</head>`)
    : `${HISTORY_PREVIEW_CANVAS_STYLE}${stripped}`;

  return withDetailPreviewBridge(withCanvasStyle);
}
