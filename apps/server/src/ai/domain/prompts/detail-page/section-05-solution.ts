/**
 * Section 5 — Solution
 *
 * Pain Points 를 받은 독자에게 "근데 이 제품은 다르다"로 전환.
 * 큰 헤드 2 줄 + 서브카피 3 줄 (Section 6 USP 미리보기) + 매력 이미지.
 *
 * ⚠ Section 5 의 subcopy 3 줄과 Section 6 의 USP 3 개는 의미적으로 1:1 매칭되어야
 * 하므로 → Section 5 → 6 chained call 권장 (Section 5 결과를 6 입력으로).
 */
import { z } from 'zod';
import { formatImageCandidates, type RawProductInput } from './types';

export const Section5Schema = z.object({
  /** 큰 헤드 line1 (4~8자, 핵심 솔루션 응축) */
  headlineLine1: z.string().min(2).max(100),
  /** 큰 헤드 line2 (5~10자, 결과/효과) */
  headlineLine2: z.string().min(2).max(100),
  /** 서브카피 정확히 3 줄 (각 8~14자, Section 6 USP 미리보기, 어법 통일) */
  subcopy: z.array(z.string().min(4).max(100)).length(3),
  /** 솔루션 이미지 (제품컷·사용씬 무관, 옵션/색상 비교 컷 제외) */
  imageIndex: z.number().int().nonnegative().nullable(),
});
export type Section5Output = z.infer<typeof Section5Schema>;

export interface Section5Input {
  raw: RawProductInput;
  koreanName: string;
}

export const SECTION_5_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. Pain Point 섹션을 받은
독자에게 "근데 이 제품은 다르다"로 전환하는 Solution 섹션을 만든다.

규칙:
1. 출력은 JSON 만.
2. 큰 헤드 2 줄:
   - headlineLine1 (4~8자): 제품의 핵심 솔루션을 응축한 단어/구절
   - headlineLine2 (5~10자): 그게 가져다주는 결과/효과
3. 서브카피 3 줄 (각 8~14자):
   - 다음 Section 6 Features 에 등장할 USP 3 개를 한 줄씩 미리 노출
   - 짧고 리듬감 있게. 서로 어법 통일 (예: 모두 "~로", "~로", "~로")
4. imageIndex: raw 이미지 중 "제품이 가장 매력적으로 보이는" 인덱스
   (제품컷·사용씬 무관). 옵션 비교/색상 비교 컷은 제외. 없으면 null.

좋은 예시:
{
  "headlineLine1": "더블샷 물총",
  "headlineLine2": "장거리 두발로",
  "subcopy": [
    "압축펌프로 멀리",
    "2분사로 동시에 쏴",
    "역전까지 노려요"
  ],
  "imageIndex": 3
}`;

export function buildSection5User(input: Section5Input): string {
  const { raw, koreanName } = input;
  return `Solution 섹션을 만들어라.

제품명: ${koreanName}
카테고리: ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 으로만 출력 (필드: headlineLine1, headlineLine2, subcopy[3], imageIndex).`;
}
