/**
 * Section 7 — KeyPoint 1
 *
 * Section 6 USP 3 개 중 USP[0] (= 가장 강력한 1번) 을 깊이 풀어주는 자리.
 * KeyPoint 영문 알약 + 큰 헤드 2 줄 + 본문 3 줄 + 큰 이미지.
 */
import { z } from 'zod';
import { formatImageCandidates, type RawProductInput } from './types';

export const Section7Schema = z.object({
  /** "KeyPoint" 영문 고정. 변경 금지. */
  tagText: z.literal('KeyPoint'),
  /** 큰 헤드 line1 (5~10자) */
  headlineLine1: z.string().min(2).max(100),
  /** 큰 헤드 line2 (5~10자, 마지막 핵심 단어가 컬러 강조됨) */
  headlineLine2: z.string().min(2).max(100),
  /** line2 안에서 컬러 강조될 단어/구절 (line2 의 부분 문자열) */
  emphasisInLine2: z.string().min(1).max(100),
  /** 본문 line1 (10~16자, USP 작동 원리) */
  body1: z.string().min(4).max(100),
  /** 본문 line2 (10~16자, 경쟁 대비 차이점) */
  body2: z.string().min(4).max(100),
  /** 본문 강조 (8~14자, 굵은 검은 결론) */
  bodyEmphasis: z.string().min(4).max(100),
  /** USP[0] 이 잘 보이는 라이프/사용씬 이미지 (라이프 우선, 화이트백도 OK) */
  imageIndex: z.number().int().nonnegative().nullable(),
});
export type Section7Output = z.infer<typeof Section7Schema>;

export interface Section7Input {
  raw: RawProductInput;
  koreanName: string;
  /** Section 6 의 USP[0] (가장 강력한 1번) — title + subtitle */
  usp0: { title: string; subtitle: string };
}

export const SECTION_7_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. Section 6 Features 의 USP 3 개 중
USP[0] (= 가장 강력한 1번) 을 깊이 풀어주는 KeyPoint 섹션을 만든다.

규칙:
1. 출력은 JSON 만.
2. tagText: "KeyPoint" 영문 고정 (변경 금지).
3. 큰 헤드 2 줄:
   - headlineLine1 (5~10자)
   - headlineLine2 (5~10자, 마지막 핵심 단어가 컬러 강조)
   - emphasisInLine2: line2 안에서 컬러 강조될 단어/구절 (1~5자)
     ※ emphasisInLine2 는 headlineLine2 의 부분 문자열이어야 함
4. 본문 정확히 3 줄:
   - body1 (10~16자): USP 가 어떻게 작동하는지
   - body2 (10~16자): 기존 제품 / 경쟁 대비의 차이점
   - bodyEmphasis (8~14자): 결론을 굵은 검은 톤으로 응축, 느낌표 1회 OK
5. imageIndex: 이 KeyPoint 의 USP 가 잘 보이는 라이프/사용씬 이미지.
   라이프스타일 우선. 없으면 null.

좋은 예시 (USP[0] = "장거리 분사 / 강력펌프" 인 경우):
{
  "tagText": "KeyPoint",
  "headlineLine1": "두 개 분사구로",
  "headlineLine2": "동시에 더블샷!",
  "emphasisInLine2": "동시에 더블샷!",
  "body1": "더블샷슈퍼워터건은 압축펌프 방식!",
  "body2": "기존 물총의 약점 사거리 고민 끝",
  "bodyEmphasis": "더 멀리! 더 강하게 쏴요",
  "imageIndex": 6
}`;

export function buildSection7User(input: Section7Input): string {
  const { raw, koreanName, usp0 } = input;
  return `KeyPoint 1 섹션을 만들어라. USP[0] 을 깊이 풀어준다.

제품명: ${koreanName}
카테고리: ${raw.rawCategory}
USP[0] (Section 6 카드 1번): ${usp0.title} / ${usp0.subtitle}
원본 설명: ${raw.rawDescription}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 으로만 출력 (필드: tagText, headlineLine1, headlineLine2, emphasisInLine2, body1, body2, bodyEmphasis, imageIndex).`;
}
