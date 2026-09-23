/**
 * 상세페이지로 그릴 수 있는 HTML 인가. 빈 값과 JSON(생성 결과를 잘못 저장한 것)은 아니다. 편집 HTML 읽기가
 * 이 판정을 쓴다.
 */
export function isRenderableDetailHtml(html: string | null | undefined): html is string {
  const source = html?.trim();
  if (!source) return false;
  if (source.startsWith('{') || source.startsWith('[')) return false;
  return (
    /^<!doctype\s+html/i.test(source) ||
    /^<html[\s>]/i.test(source) ||
    /^<body[\s>]/i.test(source) ||
    /<\/?[a-z][\s\S]*>/i.test(source)
  );
}
