/**
 * Section 9 — KeyPoint 2
 *
 * 메인 USP 3 개 외의 보조 셀링포인트 1 개 (그립/디자인/조작감/안전성/소재 등) 를
 * 다루는 자리. 텍스트 전용 (이미지 없음).
 */
import { z } from 'zod';
import type { RawProductInput } from './types';

export const Section9Schema = z.object({
  /** "KeyPoint" 영문 고정 */
  tagText: z.literal('KeyPoint'),
  /** 작은 헤드 (8~14자, 사용 상황/배경 톤, 느낌표 1회 OK) */
  smallHeadline: z.string().min(4).max(100),
  /** 큰 헤드 정확히 3 줄 */
  bigHeadline: z.object({
    line1: z.string().min(2).max(100),
    line2: z.string().min(2).max(100),
    /** 핵심 명사. 컬러 강조됨. */
    line3: z.string().min(1).max(100),
  }),
  /** line3 의 강조 부분 (대개 line3 전체) */
  emphasisInLine3: z.string().min(1).max(100),
  /** 본문 정확히 2 줄 (각 12~18자, 어법 통일) */
  body: z.array(z.string().min(6).max(100)).length(2),
  /** 사용한 보조 셀링포인트 (Section 10 중복 회피용) */
  topic: z.string().min(2).max(100),
});
export type Section9Output = z.infer<typeof Section9Schema>;

export interface Section9Input {
  raw: RawProductInput;
  koreanName: string;
  /** Section 6 의 USP 3 개 (중복 회피) */
  mainUsps: [string, string, string];
}

export const SECTION_9_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. Section 7 KeyPoint 1 + Section 8
Blue Section 이 메인 USP 3 개를 다 다뤘으므로, KeyPoint 2 는
"제품의 보조 셀링포인트 1 개" (디자인/그립/조작감/안전성/소재 등) 를 다룬다.

규칙:
1. 출력은 JSON 만.
2. tagText: "KeyPoint" 영문 고정.
3. smallHeadline (8~14자, 느낌표 1회 OK): 사용 상황/배경 톤
   ("친구들과 물총 배틀!", "유치원 가방 안에서도", "엄마 손에서 아이 손으로")
4. bigHeadline 정확히 3 줄:
   - line1 (2~6자)
   - line2 (2~6자)
   - line3 (1~5자, 핵심 명사. 컬러 강조됨)
   - emphasisInLine3: line3 의 강조 부분 (대개 line3 전체)
5. body 정확히 2 줄, 각 12~18자, 어법 통일 ("~고/서" 라임).
6. 이미지 없음. (이 섹션은 텍스트 전용)
7. 보조 셀링포인트는 메인 USP[0,1,2] 와 겹치면 안 됨.
   카테고리별 후보:
   - 완구: 그립감, 내구성, 안전 마감, 어린이 손 사이즈
   - 슬라임: 향, 무독성, 끈적임 정도, 색상
   - 문구: 그립, 내구성, 디자인, 휴대성
   - 유아용품: BPA free, 인체공학, 모서리 마감
8. topic 필드에 사용한 보조 셀링포인트 명사형으로 출력 (Section 10 입력으로 사용).

좋은 예시:
{
  "tagText": "KeyPoint",
  "smallHeadline": "친구들과 물총 배틀!",
  "bigHeadline": {
    "line1": "튼튼하게",
    "line2": "잡히는",
    "line3": "그립"
  },
  "emphasisInLine3": "그립",
  "body": [
    "가벼워서 들고 뛰기 편하고",
    "조작도 쉬워 누구나 바로 사용!"
  ],
  "topic": "그립감"
}`;

export function buildSection9User(input: Section9Input): string {
  const { raw, koreanName, mainUsps } = input;
  return `KeyPoint 2 섹션을 만들어라. 메인 USP 3 개와 다른 보조 셀링포인트 1 개를 다룬다.

제품명: ${koreanName}
카테고리: ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션/스펙: ${raw.rawOptions}
이미 다룬 메인 USP 3 개 (중복 회피):
1) ${mainUsps[0]}
2) ${mainUsps[1]}
3) ${mainUsps[2]}

JSON 으로만 출력 (필드: tagText, smallHeadline, bigHeadline, emphasisInLine3, body[2], topic).`;
}
