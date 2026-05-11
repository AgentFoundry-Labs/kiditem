/**
 * Detail Page Prompt — Common Types
 *
 * 11 개 섹션 LLM 호출의 공통 입력 / 누적 상태.
 * 1688/Alibaba raw 데이터 + 이전 섹션 산출물.
 */

/** 1688/Alibaba 스크래퍼가 넘기는 raw 제품 입력. */
export interface RawProductInput {
  /** 원문 제품명 (한자/영어 가능) */
  rawTitle: string;
  /** 원문 카테고리 (한자/영어 가능) */
  rawCategory: string;
  /** 원문 상품 설명 */
  rawDescription: string;
  /** 옵션/스펙 요약 (옵션명·색상·사이즈 등) */
  rawOptions: string;
  /** 이미지 URL 후보 (인덱스 = 배열 순서) */
  imageUrls: string[];
}

/** 이미지 후보를 프롬프트에 삽입하는 표준 포맷터. */
export function formatImageCandidates(urls: string[]): string {
  if (urls.length === 0) return '(이미지 후보 없음)';
  return urls.map((url, i) => `${i}: ${formatImageCandidate(url, i)}`).join('\n');
}

function formatImageCandidate(url: string, index: number): string {
  if (url.startsWith('data:image/')) {
    const mime = url.slice(5, url.indexOf(';base64,'));
    return `[uploaded image ${index}${mime ? `, ${mime}` : ''}]`;
  }
  if (url.length > 240) return `${url.slice(0, 237)}...`;
  return url;
}
