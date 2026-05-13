import type {
  DetailImageCount,
  DetailPageAgeGroup,
} from '@kiditem/shared/ai';

export type {
  DetailImageCount,
  DetailPageAgeGroup,
} from '@kiditem/shared/ai';

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
  /** DETAIL 본문 이미지 수. 기본 2개. 기존 auto payload도 2개로 처리한다. */
  detailImageCount?: DetailImageCount;
  /** 사용법 안내 영역 생성 여부. 기본 include. */
  usageSectionMode?: UsageSectionMode;
  /** KC 인증번호 입력 상태. 기본 unknown = AI 판단. */
  kcCertificationStatus?: KcCertificationStatus;
  /** 사용자가 직접 입력한 KC 인증번호. */
  kcCertificationNumber?: string;
}

export type UsageSectionMode = 'include' | 'exclude';
export type KcCertificationStatus = 'unknown' | 'none' | 'exists';

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
  if (detailImageCount === 'auto' || detailImageCount === undefined) return 2;
  const parsed = Number(detailImageCount);
  if (!Number.isInteger(parsed)) return 2;
  return Math.min(6, Math.max(2, parsed));
}

export function formatDetailImageCountGuidance(detailImageCount?: DetailImageCount): string {
  const count = resolveDetailImageCountLimit(detailImageCount);
  return `DETAIL 본문 이미지 수: ${count}개. 서로 다른 디테일/라이프 컷 ${count}장을 사용하고 패키지 이미지는 별도 packageImageIndices 로 분리한다.`;
}

export function formatUsageSectionGuidance(usageSectionMode?: UsageSectionMode): string {
  if (usageSectionMode === 'exclude') {
    return [
      '사용법 영역: 만들지 않음.',
      '사용법 안내, 사용 순서, 튜토리얼, 설명서형 섹션을 생성하지 않는다.',
      'bold-vertical 출력이면 usage.subtitle 는 빈 문자열, usage.imageIndices 는 빈 배열로 둔다.',
      '사용법 전용 이미지를 새로 생성하지 않고 DETAIL 본문 이미지만 구성한다.',
    ].join('\n');
  }

  return [
    '사용법 영역: 포함.',
    '상품 특성상 실제 사용 흐름 설명이 필요하면 사용법 안내 섹션을 만든다.',
    '사용법/설명서 이미지가 있으면 usage 전용 영역으로 분리한다.',
  ].join('\n');
}

export function formatKcCertificationGuidance(
  status?: KcCertificationStatus,
  number?: string,
): string {
  const normalizedNumber = normalizeKcCertificationNumber(number);
  if (status === 'none') {
    return [
      'KC 인증번호: 없음.',
      'KC 인증번호를 추정해서 만들지 않는다.',
      '안전표시/KC/바코드 이미지가 있으면 productInfo 표는 만들지 않고 하단 안전 이미지로 처리한다.',
    ].join('\n');
  }
  if (status === 'exists') {
    return [
      normalizedNumber ? `KC 인증번호: ${normalizedNumber}.` : 'KC 인증번호: 있음. 번호는 이미지/원문에서 확인 가능한 경우에만 사용한다.',
      '안전표시/KC/바코드 이미지가 있으면 productInfo 표와 중복하지 않는다.',
      normalizedNumber
        ? '안전표시/KC/바코드 이미지가 없을 때 productInfo 에 {"key":"KC 인증번호","value":"입력된 번호"}를 포함한다.'
        : '안전표시/KC/바코드 이미지가 없고 번호가 확인되면 productInfo 에 KC 인증번호 항목을 포함한다.',
    ].join('\n');
  }
  return [
    'KC 인증번호: AI가 원본 설명과 안전표시 이미지를 기준으로 판단.',
    '안전표시/KC/바코드 이미지가 있으면 productInfo 표와 중복하지 않는다.',
  ].join('\n');
}

export function normalizeKcCertificationNumber(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
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
