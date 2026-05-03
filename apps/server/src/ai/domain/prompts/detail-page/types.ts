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

/** 호출이 진행되며 누적되는 섹션 간 공유 상태. */
export interface DetailPageContext {
  /** Section 1 산출 — 한국어 제품명. 모든 후속 섹션이 사용. */
  koreanName: string;
  /** Section 1 산출 — 캐치프레이즈. Section 8 인트로에서 재사용. */
  subhead: string;
  /** Section 6 산출 — USP 3 개 명사형 (예: ["장거리 분사", "동시 2발", "대용량 물통"]) */
  mainUsps?: [string, string, string];
  /** Section 9 산출 — 보조 셀링포인트 (예: "그립감"). Section 10 중복 회피. */
  section9Topic?: string;
  /** 이미 사용된 이미지 인덱스 누적. Section 8/10/11 의 중복 회피. */
  usedImageIndices: number[];
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

/** 사용된 이미지 인덱스 목록을 프롬프트에 삽입하는 포맷터. */
export function formatUsedIndices(indices: number[]): string {
  if (indices.length === 0) return '(없음)';
  return indices.join(', ');
}
