/**
 * Section 6 — Features
 *
 * Section 5 의 subcopy 3 줄과 1:1 매칭되는 USP 카드 3 장.
 * 카드 = "01"/"02"/"03" 번호 + USP 라벨 + 헤드 + 정사각 이미지.
 *
 * ⚠ Section 5 → 6 chain 호출. 5 의 subcopy 를 입력으로 받음.
 * 6 의 USP 3 개는 Section 7/8 의 입력이 됨 (KeyPoint 1 = USP[0], Blue Section = USP[1,2]).
 */
import { z } from 'zod';
import { formatImageCandidates, type RawProductInput } from './types';

export const Section6Schema = z.object({
  /** "[카테고리 단어] 특징" 4~6자 */
  label: z.string().min(3).max(100),
  /** 중간 톤 헤드 (8~14자, 느낌표 1회 OK) */
  headline: z.string().min(4).max(100),
  /** 큰 강조 헤드 (6~10자, 느낌표 강추) */
  bigHeadline: z.string().min(3).max(100),
  /** Feature 카드 정확히 3 장 */
  cards: z
    .array(
      z.object({
        /** "01" / "02" / "03" */
        num: z.string().regex(/^0[123]$/),
        /** 작은 회색 라벨 (USP 명사형, 5~8자) */
        title: z.string().min(2).max(100),
        /** 굵은 검은 헤드 (USP 본질, 4~7자) */
        subtitle: z.string().min(2).max(100),
        /** USP 를 가장 잘 보여주는 이미지 인덱스. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .length(3),
});
export type Section6Output = z.infer<typeof Section6Schema>;

export interface Section6Input {
  raw: RawProductInput;
  koreanName: string;
  /** Section 5 의 subcopy 3 줄. USP 1:1 매칭용. */
  section5Subcopy: [string, string, string];
}

export const SECTION_6_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. Section 5 Solution 의
서브카피 3 줄과 1:1 매칭되는 Features 섹션 카드 3 장을 만든다.

규칙:
1. 출력은 JSON 만.
2. label 은 "[카테고리 단어] 특징" 4~6자
   (완구→"제품 특징"·"물총 특징", 슬라임→"슬라임 특징", 문구→"필기 특징" 등)
3. headline 은 중간 톤 한 줄 (8~14자, 느낌표 1회 OK)
4. bigHeadline 은 큰 강조 한 줄 (6~10자, 느낌표 강추)
5. cards 정확히 3 장. 각 카드:
   - num: "01" / "02" / "03"
   - title: 작은 회색 라벨 (5~8자, USP 명사형)
   - subtitle: 굵은 검은 헤드 (4~7자, USP 본질 압축)
   - imageIndex: 이 USP 를 가장 잘 보여주는 raw 이미지 인덱스. 없으면 null.
6. 3 카드의 USP 는 Section 5 의 서브카피 3 줄과 의미적으로 1:1 매칭.
   순서도 동일하게.

좋은 예시:
{
  "label": "물총 특징",
  "headline": "여름 물놀이 필수!",
  "bigHeadline": "더블샷 한방!",
  "cards": [
    { "num": "01", "title": "장거리 분사", "subtitle": "강력펌프", "imageIndex": 5 },
    { "num": "02", "title": "동시 2발",   "subtitle": "더블노즐", "imageIndex": 7 },
    { "num": "03", "title": "대용량 물통", "subtitle": "오래 사용", "imageIndex": 9 }
  ]
}`;

export function buildSection6User(input: Section6Input): string {
  const { raw, koreanName, section5Subcopy } = input;
  return `Features 섹션을 만들어라. Section 5 의 서브카피 3 줄과 USP 의미가 1:1 매칭되어야 한다.

제품명: ${koreanName}
카테고리: ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션/스펙: ${raw.rawOptions}
Section 5 서브카피 3 줄 (1:1 매칭 대상):
1) ${section5Subcopy[0]}
2) ${section5Subcopy[1]}
3) ${section5Subcopy[2]}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 으로만 출력 (필드: label, headline, bigHeadline, cards[3]).`;
}
