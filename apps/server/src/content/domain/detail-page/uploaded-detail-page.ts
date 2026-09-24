import { KiditemInvalidValueError } from '@kiditem/shared/errors';
/**
 * 다른 데서 가져온 상품의 **이미 있는 상세페이지**를 우리 상세페이지로 만든다(사장님 2026-09-22:
 * "다른데서 가져오는 상품들이 있어 ... 상세페이지를 업로드해서 등록을 하고 싶어").
 *
 * 몰에서 가져오는 상세페이지는 긴 이미지 한두 장이다(사장님 확인: "이미지야"). 그래서 만드는 것은
 * 이미지를 세로로 쌓은 HTML 한 장이고, AI 는 부르지 않는다.
 *
 * 왜 HTML 로 만드는가: 에디터 · 몰 등록 · 대량등록 엑셀이 모두 상세페이지를 HTML 로 읽는다. 올린
 * 상세페이지만 다른 모양으로 두면 그 셋을 전부 갈라야 한다.
 */

/** 상세페이지 한 장에 담을 수 있는 이미지 수. 몰에서 가져온 상세페이지는 보통 한두 장이다. */
export const UPLOADED_DETAIL_PAGE_MAX_IMAGES = 30;

/** 상세페이지 폭. 몰이 공통으로 쓰는 값이라 이미지가 잘리거나 늘어나지 않는다. */
const DETAIL_PAGE_WIDTH_PX = 860;

export type UploadedDetailPageInput = Readonly<{
  title: string;
  imageUrls: readonly string[];
}>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 올린 이미지를 세로로 쌓은 상세페이지 HTML. 이미지 사이에 여백을 두지 않는다 — 몰 상세페이지는
 * 잘라 올린 조각이 이어 붙어 한 장으로 보여야 한다.
 *
 * 이미지가 없으면 던진다. 빈 상세페이지를 만들어 두면 등록은 되는데 몰에서 빈 칸이 나간다.
 */
export function buildUploadedDetailPageHtml(input: UploadedDetailPageInput): string {
  const imageUrls = input.imageUrls.map((url) => url.trim()).filter(Boolean);
  if (imageUrls.length === 0) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'UPLOADED_IMAGES_REQUIRED' }, message: '상세페이지 이미지가 필요합니다.' });
  }
  if (imageUrls.length > UPLOADED_DETAIL_PAGE_MAX_IMAGES) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'UPLOADED_IMAGES_TOO_MANY', max: UPLOADED_DETAIL_PAGE_MAX_IMAGES },
      message: `상세페이지 이미지는 최대 ${UPLOADED_DETAIL_PAGE_MAX_IMAGES}장입니다.`,
    });
  }
  const title = escapeHtml(input.title.trim() || '상세페이지');
  const images = imageUrls
    .map((url, index) => `<img src="${escapeHtml(url)}" alt="${title} 상세 ${index + 1}" loading="lazy" />`)
    .join('\n');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { margin: 0; padding: 0; background: #ffffff; }
  .kiditem-uploaded-detail { width: 100%; max-width: ${DETAIL_PAGE_WIDTH_PX}px; margin: 0 auto; font-size: 0; }
  .kiditem-uploaded-detail img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
<div class="kiditem-uploaded-detail">
${images}
</div>
</body>
</html>`;
}
