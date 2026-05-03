/**
 * Section 4 — Pain Points
 *
 * "이 제품 안 사면 / 대체품 쓰면 생기는 문제" 섹션.
 * 상단 3 줄 카피 (작은-중간-큰 빨간) + 페인 카드 2~3 장 + 흑백 분위기 이미지.
 */
import { z } from 'zod';
import { formatImageCandidates, type RawProductInput } from './types';

export const Section4Schema = z.object({
  intro: z.object({
    /** 페인의 원인 (8~12자, "~라" 어미) */
    line1: z.string().min(4).max(100),
    /** 페인의 지속/심화 (8~12자) */
    line2: z.string().min(4).max(100),
    /** 페인의 결과를 합성어로 응축 (4~6자, 빨간 강조) */
    line3: z.string().min(2).max(100),
  }),
  cards: z
    .array(
      z.object({
        /** 회색 라벨 (14~18자, "..." 종결): 증상 설명 */
        title: z.string().min(6).max(100),
        /** 굵은 검은 헤드 (6~10자): 아픈 결과 압축 */
        subtitle: z.string().min(3).max(100),
      }),
    )
    .min(2)
    .max(3),
  /** 분위기 깔리는 이미지 (라이프/사용씬, 화이트백 X). 렌더 시 grayscale 적용. */
  moodImageIndex: z.number().int().nonnegative().nullable(),
});
export type Section4Output = z.infer<typeof Section4Schema>;

export interface Section4Input {
  raw: RawProductInput;
  koreanName: string;
}

export const SECTION_4_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. raw 제품 데이터를 보고
"이 제품을 쓰지 않으면 / 저가 대체품을 쓰면 생기는 문제"를 강조하는
Pain Point 섹션을 만든다.

규칙:
1. 출력은 JSON 만.
2. intro 3 줄:
   - line1 (작은): 페인의 원인 (8~12자, "~라" 어미)
   - line2 (중간): 페인의 지속/심화 (8~12자)
   - line3 (큰 빨간): 페인의 결과를 합성어로 응축 (4~6자).
     카테고리에 맞게: "참사", "지옥", "노답", "스트레스",
     "고생길", "낭패", "허탕" 등.
3. 페인 카드 2~3 장 (페인이 자연스럽게 도출되면 3장, 억지스러우면 2장):
   - title (회색 라벨, 14~18자, "..." 종결): 증상 설명
   - subtitle (굵은 검은 헤드, 6~10자): 아픈 결과 압축
4. 페인은 raw 데이터에서 직접 추론. 카테고리 일반 페인 + 이 제품
   고유 USP 의 반대로 합성. 너무 일반적인 페인 ("불편해요") 금지.
5. moodImageIndex 는 분위기 깔리는 컷 (라이프/사용씬 OK, 화이트백 X).
   적합한 게 없으면 null. 렌더 시 grayscale + opacity 처리됨.

좋은 예시:
{
  "intro": {
    "line1": "약한 물줄기라",
    "line2": "계속 끊이지 않는",
    "line3": "물놀이참사"
  },
  "cards": [
    { "title": "물총 사거리 부족...", "subtitle": "한방이안닿아" },
    { "title": "약한 물줄기 논란...", "subtitle": "싸움은 늘 지는 쪽" },
    { "title": "소용량 물통 주의...", "subtitle": "물 금방 떨어져요" }
  ],
  "moodImageIndex": 8
}`;

export function buildSection4User(input: Section4Input): string {
  const { raw, koreanName } = input;
  return `Pain Point 섹션을 만들어라.

제품명: ${koreanName}
카테고리: ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션/스펙: ${raw.rawOptions}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 으로만 출력 (필드: intro, cards[2~3], moodImageIndex).`;
}
