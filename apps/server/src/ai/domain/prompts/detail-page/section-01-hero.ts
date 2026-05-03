/**
 * Section 1 — Hero
 *
 * 상단 캐치프레이즈 + 제품 한국어명 + 히어로 이미지 인덱스.
 * 모든 후속 섹션이 koreanName / subhead 를 사용하므로 가장 먼저 호출.
 */
import { z } from 'zod';
import { formatImageCandidates, type RawProductInput } from './types';

export const Section1Schema = z.object({
  /** 캐치프레이즈 (8~12자). 카테고리에 맞게 LLM 자율. */
  subhead: z.string().min(4).max(100),
  /** 제품 한국어명 (6~12자). 한자/영어 직역 금지. 후속 모든 섹션이 사용. */
  mainHeadline: z.string().min(3).max(100),
  /** Hero 이미지 인덱스 (LLM-pick 모드). first 모드면 0 강제. */
  heroImageIndex: z.number().int().nonnegative().nullable(),
});
export type Section1Output = z.infer<typeof Section1Schema>;

export type HeroImageMode = 'first' | 'llm-pick';

export interface Section1Input {
  raw: RawProductInput;
  /** 'first' = 0번 이미지 강제, 'llm-pick' = LLM 이 라이프스타일컷 픽 */
  heroImageMode: HeroImageMode;
}

export const SECTION_1_SYSTEM = `너는 한국 쿠팡 상세페이지의 카피라이터다. 1688/Alibaba 에서 스크래핑한
raw 제품 데이터를 받아 상세페이지 Hero 섹션의 카피 2 줄과 히어로 이미지 인덱스를 만든다.

규칙:
1. 출력은 JSON 만. 다른 말 금지.
2. 제품 카테고리(완구/문구/슬라임/생활잡화 등)에 맞는 어휘를 골라라.
   - 완구: "필수템", "재미", "놀이", "한방", "쾌감"
   - 문구: "필수템", "신학기", "초등", "공부템"
   - 슬라임/촉감: "촉감놀이", "말랑", "스트레스 해소"
   - 유아용품: "안심", "안전", "엄마가 고른"
3. subhead 는 시즌/상황/타겟 중 1~2개 + 후킹 단어 (필수템, 한방, OK 등). 8~12자.
4. mainHeadline 은 한국어로 6~12자, 제품 본질 압축. 한자/영어 직역 금지. 광고 카피 톤.
5. heroImageIndex: heroImageMode 가 'llm-pick' 이면 라이프스타일/사용씬 우선,
   화이트백이지만 제품이 잘 보이는 컷도 OK, 옵션 비교 컷은 제외. 적합한 게 없으면 null.
   heroImageMode 가 'first' 이면 항상 0.
6. 짧고 임팩트. 부드러운 설명조 금지.

좋은 예시:
- subhead: "여름 물놀이 필수템" / mainHeadline: "더블샷슈퍼워터건"
- subhead: "신학기 등원 필수템" / mainHeadline: "굴러가는 코끼리"
- subhead: "촉감놀이 인기템"   / mainHeadline: "말랑끈적슬라임"
- subhead: "초등 인기 공부템"  / mainHeadline: "쓱쓱지우개펜"`;

export function buildSection1User(input: Section1Input): string {
  const { raw, heroImageMode } = input;
  return `다음 raw 제품 데이터를 보고 Hero 섹션을 만들어라.

heroImageMode: ${heroImageMode}
제품명(원문): ${raw.rawTitle}
카테고리(원문): ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션: ${raw.rawOptions}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 으로만 출력 (필드: subhead, mainHeadline, heroImageIndex).`;
}
