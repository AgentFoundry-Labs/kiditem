/**
 * Section 2 — Reviews
 *
 * "찐 사용 후기" 4 장 카드 — 별 5개 + headline (5~10자) + body (10~15자).
 * USP 4 개를 추출 → 후기 카피로 변환 (1:1).
 */
import { z } from 'zod';
import type { RawProductInput } from './types';

export const Section2Schema = z.object({
  reviews: z
    .array(
      z.object({
        /** USP 라벨 (사거리/대용량/내구성 등). 카드 4 장이 서로 다른 USP. */
        usp: z.string().min(2).max(100),
        /** 큰 헤드 (5~10자, 느낌표 OK) */
        headline: z.string().min(2).max(100),
        /** 작은 본문 (10~15자, 이유/근거) */
        body: z.string().min(4).max(100),
      }),
    )
    .length(4),
});
export type Section2Output = z.infer<typeof Section2Schema>;

export interface Section2Input {
  raw: RawProductInput;
  koreanName: string;
}

export const SECTION_2_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. 1688 raw 제품 데이터에서
이 제품의 핵심 USP(Unique Selling Point) 4 개를 뽑고, 각각을
"진짜 사용자 후기처럼 보이는" 짧은 카피로 변환한다.

규칙:
1. 출력은 JSON 만.
2. USP 4 개는 서로 겹치지 않게. (예: 사거리/분사방식/용량/무게)
3. 각 후기 카드 = headline (5~10자, 느낌표 OK) + body (10~15자, 이유/근거).
4. 후기 톤: 1인칭 자연스럽게. 광고 같은 단어("최고", "혁명") 금지.
   사용자 입장의 짧은 만족 표현 ("쭉!", "굿", "편해요", "꿀잼") 추천.
5. 가짜처럼 보이지 않게 카드마다 어휘/리듬 살짝씩 다르게.

좋은 예시:
{ "usp": "사거리",  "headline": "멀리까지 쭉!",      "body": "압축펌프라 시원해요" }
{ "usp": "더블샷",  "headline": "투샷이라 다 패짐!",  "body": "친구들이 깜짝 놀라요" }
{ "usp": "대용량",  "headline": "대용량이라 오래가요","body": "물 보충 덜 해서 편해요" }
{ "usp": "가벼움",  "headline": "가볍고 튼튼해서 굿", "body": "조작도 쉬워요!" }`;

export function buildSection2User(input: Section2Input): string {
  const { raw, koreanName } = input;
  return `다음 raw 제품 데이터를 보고 Reviews 섹션의 후기 카드 4 장을 만들어라.

제품명(한국어): ${koreanName}
제품명(원문): ${raw.rawTitle}
카테고리: ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션/스펙: ${raw.rawOptions}

JSON 으로만 출력 (필드: reviews[4] = { usp, headline, body }).`;
}
