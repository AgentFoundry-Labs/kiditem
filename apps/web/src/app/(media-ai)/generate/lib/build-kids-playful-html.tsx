/**
 * KidsPlayfulRenderer (React) → 정적 HTML + Tailwind CDN 주입한 풀 문서.
 *
 * 사용처:
 * - sourcing/[id] DetailPagePreview 의 iframe srcDoc
 * - sourcing/[id]/editor — GrapesJS canvas 의 init HTML
 * - 향후 다른 미리보기 영역
 *
 * 주의: client-only 함수 (renderToStaticMarkup 사용). 'use client' 컴포넌트에서만 호출.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildDetailFontReadyGateHead,
  toFontDisplayBlockUrl,
} from '@/app/(sourcing)/sourcing/lib/template-html';
import KidsPlayfulRenderer from '../components/KidsPlayfulRenderer';
import type { KidsPlayfulData } from './kids-playful-types';

function absolutizeFontUrls(css: string): string {
  if (typeof window === 'undefined') return css;
  return css
    .replace(/url\(\s*(['"]?)\/fonts\//g, `url($1${window.location.origin}/fonts/`)
    .replace(/font-display:\s*swap\s*;/gi, 'font-display: block;');
}

export function buildKidsPlayfulHtml(data: KidsPlayfulData, templateCss = ''): string {
  const inner = renderToStaticMarkup(<KidsPlayfulRenderer data={data} />);
  const compiledTemplateCss = absolutizeFontUrls(templateCss);
  const tailwindResource = compiledTemplateCss.trim()
    ? `<style>${compiledTemplateCss}</style>`
    : '<script src="https://cdn.tailwindcss.com"></script>';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=720, initial-scale=1" />
  ${tailwindResource}
  <link href="${toFontDisplayBlockUrl('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=block')}" rel="stylesheet" />
  ${buildDetailFontReadyGateHead()}
  <style>
    body { margin: 0; font-family: 'Noto Sans KR', system-ui, sans-serif; }
  </style>
  <script>
    (function () {
      function postMetrics() {
        var doc = document.documentElement;
        var body = document.body;
        parent.postMessage({
          type: 'kiditem:detail-preview-metrics',
          scrollY: window.scrollY || 0,
          innerHeight: window.innerHeight || 0,
          scrollHeight: Math.max(doc.scrollHeight || 0, body ? body.scrollHeight || 0 : 0),
          scrollWidth: Math.max(doc.scrollWidth || 0, body ? body.scrollWidth || 0 : 0, 720)
        }, '*');
      }
      window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type === 'kiditem:detail-preview-scroll' && typeof data.y === 'number') {
          window.scrollTo({ top: Math.max(0, data.y), behavior: data.behavior || 'smooth' });
        }
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
      setInterval(postMetrics, 1000);
    })();
  </script>
</head>
<body>${inner}</body>
</html>`;
}
