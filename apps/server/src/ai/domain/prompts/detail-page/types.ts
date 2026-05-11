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
  /** 상세페이지 사용 연령 기준. 기본은 age-8-plus. */
  ageGroup?: DetailPageAgeGroup;
  /** DETAIL 본문 이미지 수. 기본 auto = 2~3개. */
  detailImageCount?: DetailImageCount;
}

export type DetailPageAgeGroup = 'age-8-plus' | 'age-14-plus';
export type DetailImageCount = 'auto' | '1' | '2' | '3';

export function formatAudienceGuidance(ageGroup?: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') {
    return [
      '사용 연령 기준: 14세 이상 상품',
      '카피의 실제 사용자는 어린아이/유아/초등 저학년이 아니라 중고등학생·청소년이다.',
      '"아이", "어린아이", "유아", "꼬마" 같은 표현 대신 "중고등학생", "청소년", "학생" 표현을 우선 사용한다.',
      '사용 장면은 학교생활, 동아리, 취미, 야외활동, 친구와 함께 쓰는 상황처럼 청소년에게 자연스럽게 만든다.',
      '보호자 구매 관점은 필요할 때만 보조로 쓰고, 상세페이지의 이미지/문구 사용자는 청소년 기준으로 맞춘다.',
    ].join('\n');
  }

  return [
    '사용 연령 기준: 8세 이상 상품',
    '카피의 실제 사용자는 초등학생 이상 아동이다. "아이", "어린이", "초등학생" 표현을 사용할 수 있다.',
    '단, 유아/영아처럼 너무 어린 사용 장면으로 만들지 말고 8세 이상에게 자연스러운 놀이·학습·생활 장면으로 맞춘다.',
  ].join('\n');
}

export function resolveDetailImageCountLimit(detailImageCount?: DetailImageCount): number {
  if (detailImageCount === '1') return 1;
  if (detailImageCount === '2') return 2;
  return 3;
}

export function formatDetailImageCountGuidance(detailImageCount?: DetailImageCount): string {
  if (detailImageCount === '1') {
    return 'DETAIL 본문 이미지 수: 1개. 핵심 디테일 컷 1장만 사용하고 패키지 이미지는 별도 packageImageIndices 로 분리한다.';
  }
  if (detailImageCount === '2') {
    return 'DETAIL 본문 이미지 수: 2개. 서로 다른 디테일/라이프 컷 2장을 사용하고 패키지 이미지는 별도 packageImageIndices 로 분리한다.';
  }
  if (detailImageCount === '3') {
    return 'DETAIL 본문 이미지 수: 3개. 서로 다른 디테일/라이프 컷 3장을 사용하고 패키지 이미지는 별도 packageImageIndices 로 분리한다.';
  }
  return 'DETAIL 본문 이미지 수: 기본 2~3개. 상품 이미지가 충분하면 3장, 부족하면 2장 정도로 자연스럽게 구성한다.';
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
