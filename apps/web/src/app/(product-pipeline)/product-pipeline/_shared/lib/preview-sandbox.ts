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

export interface DetailPreviewLayoutMetrics {
  scale: number;
  minimapWidth: number;
  contentHeight: number;
  viewportTop: number;
  viewportHeight: number;
}

export function buildDetailPreviewLayoutMetrics(
  data: DetailPreviewMetricsMessage,
  options: {
    containerHeight: number;
    maxMinimapWidth: number;
  },
): DetailPreviewLayoutMetrics {
  const contentHeight = Math.max(1, Math.round(data.scrollHeight));
  const fullWidth = Math.max(1, Math.round(data.scrollWidth || 720));
  const containerHeight = Math.max(1, Math.round(options.containerHeight));
  const widthScale = options.maxMinimapWidth / fullWidth;
  const heightScale = containerHeight / contentHeight;
  const scale = Number(Math.min(widthScale, heightScale).toFixed(5));

  return {
    scale,
    minimapWidth: Math.max(1, Math.round(fullWidth * scale)),
    contentHeight,
    viewportTop: Math.max(0, Math.round(data.scrollY)),
    viewportHeight: Math.max(0, Math.round(data.innerHeight)),
  };
}

export function isSameDetailPreviewLayout(
  prev: DetailPreviewLayoutMetrics,
  next: DetailPreviewLayoutMetrics,
): boolean {
  return (
    Math.abs(prev.scale - next.scale) < 0.001 &&
    Math.abs(prev.minimapWidth - next.minimapWidth) < 1 &&
    Math.abs(prev.contentHeight - next.contentHeight) < 2 &&
    Math.abs(prev.viewportTop - next.viewportTop) < 1 &&
    Math.abs(prev.viewportHeight - next.viewportHeight) < 1
  );
}

export function stripSrcDocScripts(html: string): string {
  return html
    .replace(SCRIPT_TAG_PATTERN, '')
    .replace(SELF_CLOSING_SCRIPT_TAG_PATTERN, '');
}

export function stripDetailPreviewBridgeScripts(html: string): string {
  return html
    .replace(SCRIPT_TAG_PATTERN, (script) => (isDetailPreviewBridgeScript(script) ? '' : script))
    .replace(SELF_CLOSING_SCRIPT_TAG_PATTERN, (script) =>
      isDetailPreviewBridgeScript(script) ? '' : script,
    );
}

function isDetailPreviewBridgeScript(script: string): boolean {
  return (
    script.includes(BRIDGE_MARKER) ||
    script.includes(DETAIL_PREVIEW_METRICS_MESSAGE) ||
    script.includes(DETAIL_PREVIEW_SCROLL_MESSAGE) ||
    script.includes('__kiditemDetailPreviewBridgeInstalled')
  );
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
  const source = stripDetailPreviewBridgeScripts(html);

  const bridge = buildBridgeScript();
  if (/<\/body\s*>/i.test(source)) {
    return source.replace(/<\/body\s*>/i, `${bridge}</body>`);
  }
  return `${source}${bridge}`;
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
  var lastMetrics = null;
  var frameRequest = 0;
  var extentCache = null;
  var extentCacheAt = 0;

  function ensureNormalizationStyles() {
    if (!document.head) return;
    if (document.head.querySelector('style[${BRIDGE_MARKER}]')) return;
    var style = document.createElement('style');
    style.setAttribute(${JSON.stringify(BRIDGE_MARKER)}, '');
    style.textContent =
      'html,body{min-height:0!important;height:auto!important}' +
      '[class*="min-h-screen"]{min-height:0!important}' +
      '[class*="h-screen"]{height:auto!important}';
    document.head.appendChild(style);
  }
  ensureNormalizationStyles();

  function measureDocumentExtent() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollX = window.scrollX || window.pageXOffset || 0;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var maxBottom = 1;
    var maxRight = 720;

    if (body) {
      var nodes = body.querySelectorAll('*');
      for (var i = 0; i < nodes.length; i += 1) {
        var el = nodes[i];
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') continue;
        var rect = el.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) continue;
        maxBottom = Math.max(maxBottom, rect.bottom + scrollY);
        maxRight = Math.max(maxRight, rect.right + scrollX);
      }
    }

    if (maxBottom <= 1) {
      maxBottom = Math.max(
        doc ? doc.offsetHeight || 0 : 0,
        body ? body.offsetHeight || 0 : 0,
        1
      );
    }

    return {
      height: Math.ceil(maxBottom),
      width: Math.ceil(maxRight)
    };
  }

  function getDocumentExtent() {
    var now = Date.now();
    if (extentCache && now - extentCacheAt < 180) return extentCache;
    extentCache = measureDocumentExtent();
    extentCacheAt = now;
    return extentCache;
  }

  function readMetrics() {
    var extent = getDocumentExtent();
    return {
      type: metricsType,
      scrollY: Math.round(window.scrollY || 0),
      innerHeight: Math.round(window.innerHeight || 0),
      scrollHeight: Math.round(Math.max(extent.height, 1)),
      scrollWidth: Math.round(Math.max(extent.width, 720))
    };
  }

  function hasMetricChanged(next) {
    if (!lastMetrics) return true;
    return (
      Math.abs(next.scrollY - lastMetrics.scrollY) >= 1 ||
      Math.abs(next.innerHeight - lastMetrics.innerHeight) >= 1 ||
      Math.abs(next.scrollHeight - lastMetrics.scrollHeight) >= 2 ||
      Math.abs(next.scrollWidth - lastMetrics.scrollWidth) >= 1
    );
  }

  function postMetrics() {
    var next = readMetrics();
    if (!hasMetricChanged(next)) return;
    lastMetrics = next;
    parent.postMessage(next, '*');
  }

  function scheduleMetrics() {
    if (frameRequest) return;
    var raf = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 16); };
    frameRequest = raf(function () {
      frameRequest = 0;
      postMetrics();
    });
  }

  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type !== scrollType || typeof data.y !== 'number') return;
    window.scrollTo({
      top: Math.max(0, data.y),
      behavior: data.behavior === 'auto' ? 'auto' : 'smooth'
    });
  });

  window.addEventListener('scroll', scheduleMetrics, { passive: true });
  window.addEventListener('resize', scheduleMetrics);
  window.addEventListener('load', function () {
    scheduleMetrics();
    setTimeout(scheduleMetrics, 250);
    setTimeout(scheduleMetrics, 750);
    setTimeout(scheduleMetrics, 1500);
    setTimeout(scheduleMetrics, 3000);
  });

  if ('ResizeObserver' in window) {
    var observer = new ResizeObserver(scheduleMetrics);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
  }

  Array.prototype.forEach.call(document.images || [], function (image) {
    if (!image.complete) {
      image.addEventListener('load', scheduleMetrics, { once: true });
      image.addEventListener('error', scheduleMetrics, { once: true });
    }
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleMetrics).catch(function () {});
  }

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    setTimeout(scheduleMetrics, 0);
  }
})();
</script>`;
}
