import { describe, expect, it } from 'vitest';
import {
  DETAIL_PREVIEW_METRICS_MESSAGE,
  DETAIL_PREVIEW_SCROLL_MESSAGE,
  SCRIPTED_PREVIEW_SANDBOX,
  SAME_ORIGIN_SCRIPTLESS_SANDBOX,
  isDetailPreviewMetricsMessage,
  stripSrcDocScripts,
  withDetailPreviewBridge,
} from './preview-sandbox';

describe('preview sandbox helpers', () => {
  it('keeps scripted srcDoc previews out of the app origin', () => {
    expect(SCRIPTED_PREVIEW_SANDBOX).toContain('allow-scripts');
    expect(SCRIPTED_PREVIEW_SANDBOX).not.toContain('allow-same-origin');
  });

  it('allows same-origin access only for scriptless capture documents', () => {
    expect(SAME_ORIGIN_SCRIPTLESS_SANDBOX).toContain('allow-same-origin');
    expect(SAME_ORIGIN_SCRIPTLESS_SANDBOX).not.toContain('allow-scripts');
  });

  it('removes inline and external script tags from srcDoc HTML', () => {
    const html = [
      '<html><head>',
      '<script src="https://cdn.tailwindcss.com"></script>',
      '<script>window.evil = true;</script>',
      '</head><body><main>safe</main></body></html>',
    ].join('');

    const stripped = stripSrcDocScripts(html);

    expect(stripped).toContain('<main>safe</main>');
    expect(stripped).not.toMatch(/<script\b/i);
    expect(stripped).not.toContain('window.evil');
  });

  it('injects one postMessage bridge before the closing body tag', () => {
    const bridged = withDetailPreviewBridge('<html><body><main>preview</main></body></html>');

    expect(bridged).toContain('data-kiditem-preview-bridge');
    expect(bridged).toContain(DETAIL_PREVIEW_METRICS_MESSAGE);
    expect(bridged).toContain(DETAIL_PREVIEW_SCROLL_MESSAGE);
    expect(bridged.indexOf('data-kiditem-preview-bridge')).toBeLessThan(bridged.indexOf('</body>'));
    expect(withDetailPreviewBridge(bridged)).toBe(bridged);
  });

  it('validates preview metric messages', () => {
    expect(isDetailPreviewMetricsMessage({
      type: DETAIL_PREVIEW_METRICS_MESSAGE,
      scrollY: 12,
      innerHeight: 800,
      scrollHeight: 3200,
      scrollWidth: 720,
    })).toBe(true);

    expect(isDetailPreviewMetricsMessage({
      type: DETAIL_PREVIEW_METRICS_MESSAGE,
      scrollY: '12',
      innerHeight: 800,
      scrollHeight: 3200,
      scrollWidth: 720,
    })).toBe(false);
    expect(isDetailPreviewMetricsMessage({ type: 'other' })).toBe(false);
  });
});
