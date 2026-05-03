/**
 * Section 10 — Lifestyles / Attributes
 *
 * 보조 속성 3 개 (가벼움/조작/내구성/안전 등) 를 라이프스타일 카드 3 장으로.
 * 각 카드 = 작은 헤드 + 큰 헤드 2 줄 (마지막 단어 강조) + 라이프 이미지.
 */
import { z } from 'zod';
import {
  formatImageCandidates,
  formatUsedIndices,
  type RawProductInput,
} from './types';

export const Section10Schema = z.object({
  cards: z
    .array(
      z.object({
        /** 작은 헤드 (5~10자) */
        smallHeadline: z.string().min(2).max(100),
        /** 큰 헤드 line1 (4~7자) */
        bigHeadlineLine1: z.string().min(2).max(100),
        /** 큰 헤드 line2 (2~5자, 컬러 강조) */
        bigHeadlineLine2: z.string().min(1).max(100),
        /** 라이프/사용씬 이미지. usedImageIndices 와 중복 X. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .length(3),
});
export type Section10Output = z.infer<typeof Section10Schema>;

export interface Section10Input {
  raw: RawProductInput;
  koreanName: string;
  /** Section 6 메인 USP 3 개 (주제 중복 회피) */
  mainUsps: [string, string, string];
  /** Section 9 보조 셀링포인트 (주제 중복 회피) */
  section9Topic: string;
  /** 이전 섹션이 사용한 이미지 인덱스 (중복 회피) */
  usedImageIndices: number[];
}

export const SECTION_10_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. 보조 속성 (가벼움, 조작, 내구성,
안전, 휴대성 등) 3 개를 골라 라이프스타일 카드 3 장을 만든다.

규칙:
1. 출력은 JSON 만.
2. cards 정확히 3 장. 메인 USP[0,1,2] / Section 9 보조 셀링포인트와
   주제 중복 금지.
3. 각 카드:
   - smallHeadline (5~10자): 속성을 짧은 한 마디로
     ("가벼운 무게로", "조작은 더 쉽게", "안전한 그립 디자인")
   - bigHeadlineLine1 (4~7자): 결과/효과 도입
   - bigHeadlineLine2 (2~5자, 컬러 강조됨): 결과 응축
   - imageIndex: 라이프스타일/사용씬 우선. usedImageIndices 와 중복 X.
     없으면 null.
4. 카테고리별 추천 속성:
   - 완구: 가벼움, 조작, 내구성, 안전
   - 슬라임: 보관, 손 안 닿는 곳, 무독성, 색상 다양성
   - 문구: 그립, 휴대성, 디자인, 내구성
   - 유아용품: 안전 마감, 인체공학, 세척, 보관

좋은 예시:
{
  "cards": [
    {
      "smallHeadline": "가벼운 무게로",
      "bigHeadlineLine1": "들고 뛰어도",
      "bigHeadlineLine2": "가뿐",
      "imageIndex": 17
    },
    {
      "smallHeadline": "조작은 더 쉽게",
      "bigHeadlineLine1": "한 손으로도",
      "bigHeadlineLine2": "척척",
      "imageIndex": 19
    },
    {
      "smallHeadline": "안전한 그립 디자인",
      "bigHeadlineLine1": "내구성 탄탄",
      "bigHeadlineLine2": "오래오래",
      "imageIndex": 21
    }
  ]
}`;

export function buildSection10User(input: Section10Input): string {
  const { raw, koreanName, mainUsps, section9Topic, usedImageIndices } = input;
  return `Lifestyles 섹션을 만들어라. 보조 속성 3 개 (메인 USP / Section 9 와 중복 X) 로 카드 3 장.

제품명: ${koreanName}
카테고리: ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
이미 다룬 메인 USP 3 개:
1) ${mainUsps[0]}
2) ${mainUsps[1]}
3) ${mainUsps[2]}
이미 다룬 보조 셀링포인트 (Section 9): ${section9Topic}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}
이미 사용된 이미지 인덱스 (중복 회피): ${formatUsedIndices(usedImageIndices)}

JSON 으로만 출력 (필드: cards[3]).`;
}
