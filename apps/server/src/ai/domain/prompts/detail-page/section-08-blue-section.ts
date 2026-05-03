/**
 * Section 8 — Blue Section Details
 *
 * 파란 배경 안에서 USP[1] + USP[2] 를 각각 큰 블록으로 풀어줌. (USP[0] 은 Section 7 차지)
 * 인트로 3 줄 (작은-중간-제품명) + 블록 2 개 (각 알약/헤드/본문/이미지).
 *
 * ⚠ Section 1 의 subhead 와 koreanName, Section 6 의 USP[1,2], 누적 usedImageIndices 입력.
 */
import { z } from 'zod';
import {
  formatImageCandidates,
  formatUsedIndices,
  type RawProductInput,
} from './types';

export const Section8Schema = z.object({
  /** 인트로: USP 들을 통합한 짧은 카피 (8~14자) */
  introLine1: z.string().min(4).max(100),
  /** 인트로: Section 1 의 subhead 그대로 재사용 */
  introLine2: z.string().min(4).max(100),
  /** 인트로: 제품 한국어명 그대로 재사용 */
  introLine3: z.string().min(3).max(100),
  /** 정확히 2 블록. 0 = USP[1], 1 = USP[2] */
  blocks: z
    .array(
      z.object({
        /** "0{N}. {USP 명사형}" (예: "01. 압축펌프") */
        pillLabel: z.string().min(4).max(100),
        /** 큰 흰 헤드 (5~14자, 1~2줄. 줄바꿈은 \n) */
        headline: z.string().min(2).max(100),
        /** 옅은 파랑 톤 본문 (16~32자, 1~2줄. 줄바꿈은 \n) */
        body: z.string().min(8).max(100),
        /** USP 를 잘 보여주는 이미지. usedImageIndices 와 중복 X. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .length(2),
});
export type Section8Output = z.infer<typeof Section8Schema>;

export interface Section8Input {
  raw: RawProductInput;
  koreanName: string;
  /** Section 1 산출 — 인트로 line2 로 재사용 */
  section1Subhead: string;
  /** Section 6 산출 — USP[1] (블록 0) + USP[2] (블록 1) */
  usp1: { title: string; subtitle: string };
  usp2: { title: string; subtitle: string };
  /** 이전 섹션이 사용한 이미지 인덱스 (중복 회피) */
  usedImageIndices: number[];
}

export const SECTION_8_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. Section 6 의 USP 3 개 중
USP[1] 과 USP[2] 를 각각 큰 블록으로 풀어주는 Blue Section 을 만든다.
(USP[0] 은 Section 7 KeyPoint 1 에서 이미 다뤘음.)

규칙:
1. 출력은 JSON 만.
2. 상단 인트로 3 줄:
   - introLine1 (8~14자): USP 들을 통합한 짧은 카피
   - introLine2: Section 1 의 캐치프레이즈 그대로 재사용 (입력으로 받음)
   - introLine3: 제품 한국어명 그대로 재사용 (입력으로 받음)
3. blocks 정확히 2 개. 순서 고정: blocks[0] → USP[1], blocks[1] → USP[2].
   각 블록:
   - pillLabel: "0{N}. {USP 명사형}" (예: "01. 압축펌프", "02. 대용량 물통")
   - headline (5~14자, 1~2줄): 큰 흰 헤드. 강조 색 X. 줄바꿈은 \\n.
   - body (16~32자, 1~2줄): 옅은 파랑 톤 본문. 줄바꿈은 \\n.
   - imageIndex: USP 를 잘 보여주는 raw 이미지. 단, 입력으로 받는
     usedImageIndices 와 중복되면 안 됨. 없으면 null.

좋은 예시:
{
  "introLine1": "두 개 분사구로 한 번에",
  "introLine2": "여름 물놀이 필수템",
  "introLine3": "더블샷 슈퍼워터건",
  "blocks": [
    {
      "pillLabel": "01. 압축펌프",
      "headline": "멀리까지 쭉!",
      "body": "강력 압축펌프로\\n장거리로 시원하게 한 방에!",
      "imageIndex": 11
    },
    {
      "pillLabel": "02. 대용량 물통",
      "headline": "오래 놀아도\\n든든",
      "body": "대용량 물통으로 리필 걱정 줄이고\\n더 오래, 더 신나게 즐겨요",
      "imageIndex": 14
    }
  ]
}`;

export function buildSection8User(input: Section8Input): string {
  const { raw, koreanName, section1Subhead, usp1, usp2, usedImageIndices } = input;
  return `Blue Section 을 만들어라. USP[1] / USP[2] 를 각각 1 블록씩 풀어준다.

제품명(한국어): ${koreanName}
Section 1 캐치프레이즈 (introLine2 에 그대로 사용): ${section1Subhead}
USP[1] (블록 0): ${usp1.title} / ${usp1.subtitle}
USP[2] (블록 1): ${usp2.title} / ${usp2.subtitle}
원본 설명: ${raw.rawDescription}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}
이미 사용된 이미지 인덱스 (중복 회피): ${formatUsedIndices(usedImageIndices)}

JSON 으로만 출력 (필드: introLine1, introLine2, introLine3, blocks[2]).`;
}
