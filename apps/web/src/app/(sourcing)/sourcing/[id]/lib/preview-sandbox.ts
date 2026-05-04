export const DETAIL_PREVIEW_METRICS_MESSAGE = 'kiditem:detail-preview-metrics';
export const DETAIL_PREVIEW_SCROLL_MESSAGE = 'kiditem:detail-preview-scroll';
export const SCRIPTED_PREVIEW_SANDBOX = 'allow-scripts';
export const SAME_ORIGIN_SCRIPTLESS_SANDBOX = 'allow-same-origin';

const BRIDGE_MARKER = 'data-kiditem-preview-bridge';
const SCRIPT_TAG_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SELF_CLOSING_SCRIPT_TAG_PATTERN = /<script\b[^>]*\/\s*>/gi;

export interface DetailPreviewMetricsMessage {
  type: typeof DETAIL_PREVIEW_METRICS_MESSAGE;
  scrollY: number;
  innerHeight: number;
  scrollHeight: number;
  scrollWidth: number;
}

export function stripSrcDocScripts(html: string): string {
  return html
    .replace(SCRIPT_TAG_PATTERN, '')
    .replace(SELF_CLOSING_SCRIPT_TAG_PATTERN, '');
}

export function isDetailPreviewMetricsMessage(value: unknown): value is DetailPreviewMetricsMessage {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    data.type === DETAIL_PREVIEW_METRICS_MESSAGE &&
    typeof data.scrollY === 'number' &&
    typeof data.innerHeight === 'number' &&
    typeof data.scrollHeight === 'number' &&
    typeof data.scrollWidth === 'number'
  );
}

export function withDetailPreviewBridge(html: string): string {
  if (html.includes(BRIDGE_MARKER)) return html;

  const bridge = buildBridgeScript();
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${bridge}</body>`);
  }
  return `${html}${bridge}`;
}

function buildBridgeScript(): string {
  const metricsType = JSON.stringify(DETAIL_PREVIEW_METRICS_MESSAGE);
  const scrollType = JSON.stringify(DETAIL_PREVIEW_SCROLL_MESSAGE);

  return `<script ${BRIDGE_MARKER}>
(function () {
  if (window.__kiditemDetailPreviewBridgeInstalled) return;
  window.__kiditemDetailPreviewBridgeInstalled = true;

  var metricsType = ${metricsType};
  var scrollType = ${scrollType};

  function postMetrics() {
    var doc = document.documentElement;
    var body = document.body;
    parent.postMessage({
      type: metricsType,
      scrollY: window.scrollY || 0,
      innerHeight: window.innerHeight || 0,
      scrollHeight: Math.max(doc.scrollHeight || 0, body ? body.scrollHeight || 0 : 0, 1),
      scrollWidth: Math.max(doc.scrollWidth || 0, body ? body.scrollWidth || 0 : 0, 720)
    }, '*');
  }

  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type !== scrollType || typeof data.y !== 'number') return;
    window.scrollTo({
      top: Math.max(0, data.y),
      behavior: data.behavior === 'auto' ? 'auto' : 'smooth'
    });
  });

  window.addEventListener('scroll', postMetrics, { passive: true });
  window.addEventListener('resize', postMetrics);
  window.addEventListener('load', function () {
    postMetrics();
    setTimeout(postMetrics, 500);
    setTimeout(postMetrics, 1500);
    setTimeout(postMetrics, 3500);
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(postMetrics).observe(document.documentElement);
  }

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    setTimeout(postMetrics, 0);
  }
  setInterval(postMetrics, 1000);
})();
</script>`;
}
