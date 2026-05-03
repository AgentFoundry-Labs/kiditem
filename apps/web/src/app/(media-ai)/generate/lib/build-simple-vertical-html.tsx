/**
 * SimpleVertical (packages/templates) → 정적 HTML + Tailwind CDN.
 *
 * packages 의 SimpleVertical 을 그대로 사용 — 형식 변형 없음.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { parseDetailPageData, SimpleVertical } from '@kiditem/templates';
import type { DetailPageData } from '@kiditem/templates';

export function buildSimpleVerticalHtml(partial: Partial<DetailPageData>): string {
  // zod 가 default 채워주도록 parse
  const data = parseDetailPageData(partial);
  const inner = renderToStaticMarkup(<SimpleVertical data={data} />);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=860, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;700;900&display=swap" rel="stylesheet" />
  <style>
    body { margin: 0; font-family: 'Pretendard', system-ui, sans-serif; }
  </style>
</head>
<body>${inner}</body>
</html>`;
}
