import { describe, expect, it } from 'vitest';
import { buildHistoryPreviewHtml } from './history-preview-html';

describe('history preview html', () => {
  it('strips source scripts and injects fullscreen preview styles with a metrics bridge', () => {
    const html = `<!doctype html>
<html>
<head><title>Preview</title></head>
<body>
  <main style="width: 720px">content</main>
  <script>alert('remove me')</script>
</body>
</html>`;

    const result = buildHistoryPreviewHtml(html);

    expect(result).not.toContain("alert('remove me')");
    expect(result).toContain('data-kiditem-history-preview-canvas');
    expect(result.indexOf('data-kiditem-history-preview-canvas')).toBeLessThan(
      result.indexOf('</head>'),
    );
    expect(result).toContain('kiditem:detail-preview-metrics');
  });

  it('prepends the canvas style when the preview html has no head element', () => {
    const result = buildHistoryPreviewHtml('<section>content</section>');

    expect(result.trim().startsWith('<style data-kiditem-history-preview-canvas>')).toBe(true);
    expect(result).toContain('<section>content</section>');
  });
});
