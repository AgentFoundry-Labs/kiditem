/**
 * Section 3 — Usage 200%
 *
 * 카테고리 적응 라벨 ("[키워드] 200%") + 메인 헤드 + 서브 + 시나리오 카드 2~3 장.
 * 각 카드 = 와이드 이미지 1장 + 오버레이 카피 1줄.
 */
import { z } from 'zod';
import { formatImageCandidates, type RawProductInput } from './types';

export const Section3Schema = z.object({
  /** "[키워드] 200%" 패턴 라벨 */
  label: z.string().min(4).max(100),
  /** 메인 헤드 (8~14자, 느낌표 1회 OK) */
  headline: z.string().min(4).max(100),
  /** 서브카피 (10~16자) */
  subhead: z.string().min(4).max(100),
  /** 활용 시나리오 카드 2~3 개 */
  scenarios: z
    .array(
      z.object({
        /** 오버레이 카피 (12~20자, 임팩트) */
        caption: z.string().min(6).max(100),
        /** 라이프/사용씬 이미지 인덱스. 화이트백 제외. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .min(2)
    .max(3),
});
export type Section3Output = z.infer<typeof Section3Schema>;

export interface Section3Input {
  raw: RawProductInput;
  koreanName: string;
}

export const SECTION_3_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. 1688 raw 제품 데이터로
"활용 시나리오" 섹션의 카피와 이미지 매핑을 만든다.

규칙:
1. 출력은 JSON 만.
2. label 은 "[키워드] 200%" 패턴. 카테고리 단어 매핑:
   - 완구/게임: "활용도 200%", "재미 200%"
   - 슬라임/촉감: "촉감놀이 200%", "스트레스해소 200%"
   - 문구/공부: "사용감 200%", "필기감 200%"
   - 유아/안전용품: "안심도 200%"
   - 생활잡화: "편의성 200%"
3. headline = 활용 한 컷 압축 (8~14자, 느낌표 1회 OK).
4. subhead = headline 을 풀어주는 한 줄 (10~16자).
5. scenarios = 2~3 개. 활용 장면이 풍부하면 3 개, 아니면 2 개.
   각 = 오버레이 캡션 1줄 (12~20자) + 이미지 인덱스.
6. imageIndex 는 raw 이미지 후보에서 "사용씬/라이프스타일컷" 인덱스.
   화이트백 컷 제외. 매칭 못 하면 null.

좋은 예시:
{
  "label": "활용도 200%",
  "headline": "여름 물총 게임!",
  "subhead": "물총싸움이 더 재밌게",
  "scenarios": [
    { "caption": "야외 물놀이에서 쏘는 맛, 제대로!", "imageIndex": 4 },
    { "caption": "2분사로 승부 끝! 팀전도 꿀잼!",     "imageIndex": 7 }
  ]
}`;

export function buildSection3User(input: Section3Input): string {
  const { raw, koreanName } = input;
  return `Usage 섹션을 만들어라.

제품명(한국어): ${koreanName}
카테고리: ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 으로만 출력 (필드: label, headline, subhead, scenarios[2~3]).`;
}
