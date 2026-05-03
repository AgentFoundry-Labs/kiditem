/**
 * Detail Page — Single Call Mode
 *
 * 11 개 섹션을 한 번의 Gemini 호출로 통째로 생성.
 * - 장점: cross-section 일관성 자동 (USP 1:1 매칭, 캐치프레이즈 재사용,
 *   이미지 중복 회피), 호출 1 회로 비용/레이턴시 최소.
 * - 단점: 출력 토큰 ~3K. Flash max 8K 안에 들어오지만 잘리지 않게 schema
 *   설명을 압축해야 함.
 *
 * 품질 안 나오면 11-call (또는 phase 별 chunked) 로 폴백 가능. 그때는
 * section-01 ~ section-11 각 모듈을 wiring 하면 됨.
 */
import { z } from 'zod';
import { Section1Schema, type HeroImageMode } from './section-01-hero';
import { Section2Schema } from './section-02-reviews';
import { Section3Schema } from './section-03-usage';
import { Section4Schema } from './section-04-pain-points';
import { Section5Schema } from './section-05-solution';
import { Section6Schema } from './section-06-features';
import { Section7Schema } from './section-07-keypoint-1';
import { Section8Schema } from './section-08-blue-section';
import { Section9Schema } from './section-09-keypoint-2';
import { Section10Schema } from './section-10-lifestyles';
import { Section11Schema } from './section-11-gallery';
import { formatImageCandidates, type RawProductInput } from './types';

/** 11 개 섹션 산출의 합. 1-call 모드의 응답 schema. */
export const DetailPageGenerationSchema = z.object({
  section1: Section1Schema,
  section2: Section2Schema,
  section3: Section3Schema,
  section4: Section4Schema,
  section5: Section5Schema,
  section6: Section6Schema,
  section7: Section7Schema,
  section8: Section8Schema,
  section9: Section9Schema,
  section10: Section10Schema,
  section11: Section11Schema,
});
export type DetailPageGeneration = z.infer<typeof DetailPageGenerationSchema>;

export interface SingleCallInput {
  raw: RawProductInput;
  heroImageMode: HeroImageMode;
}

export const SINGLE_CALL_SYSTEM = `너는 한국 쿠팡 상세페이지의 카피라이터다. 1688/Alibaba 에서 스크래핑한
raw 제품 데이터를 받아 "kids-playful (트렌드 광고형)" 템플릿의 11 개 섹션
카피와 이미지 인덱스를 한 응답에 통째로 만든다.

# 출력 규칙
1. 응답은 **JSON 객체 1 개만**. 다른 텍스트 / 코드펜스 금지.
2. 모든 카피는 한국어. 한자/영어 직역 금지. 광고 톤. 짧고 임팩트.
3. 모든 imageIndex 필드는 입력 이미지 후보의 인덱스 (0-based) 또는 null.
4. 카테고리(완구/문구/슬라임/유아용품/생활잡화 등)에 어휘를 맞춘다.

# Cross-section 일관성 (반드시 만족)
A. **제품 한국어명 일관성**: section1.mainHeadline 으로 정한 한국어 제품명을
   section8.introLine3 에 그대로 다시 사용.
B. **캐치프레이즈 재사용**: section1.subhead 를 section8.introLine2 에 그대로.
C. **USP 1:1 매칭**: section5.subcopy[0,1,2] 와 section6.cards[0,1,2] 의
   USP 의미가 순서대로 1:1 매칭. section5 의 subcopy 가 미리보기, section6 가 본편.
D. **USP 분담**: section7 = section6.cards[0] 깊이 풀이.
   section8.blocks[0] = section6.cards[1], section8.blocks[1] = section6.cards[2].
E. **보조 셀링포인트 분리**: section9.topic 은 section6.cards 의 USP 와 다른 주제.
   section10.cards 의 3 개 속성도 section6 USP / section9.topic 과 모두 다른 주제.

# 이미지 매칭 정책 (중요)
- 입력 이미지 N 장은 **최대한 활용**. null 은 진짜 부적합할 때 최소한으로.
- 라이프/사용씬 우선이지만 부족하면 **화이트백 단독컷도 OK**. "완벽한 라이프컷이 없어서 null" 은 금지.
- 같은 이미지가 두 섹션에 중복되는 것보다 약간 어색해도 매칭하는 편이 낫다.
  단, **section7 ↔ section8.blocks ↔ section10 ↔ section11 같은 큰 영역끼리는 가능한 한 다른 컷**.
- 전체 imageIndex 슬롯 중 null 비율은 **30 % 이하 권장**. 이미지 후보가 5장 이상이면 null 거의 없게.
- 이미지가 정말 1~2장만 있고 슬롯이 더 많을 때만 null 다수 허용.

# 줄바꿈 정책
줄바꿈 \\n 은 오직 다음 두 필드에서만 허용 (각 1~2줄):
  - section8.blocks[].headline
  - section8.blocks[].body
그 외 **모든 string 필드는 single-line**. \\n 절대 사용 금지.
(section3.headline, section9.body[i], section11.closing.* 등 모두 한 줄로.)

# 섹션별 룰 (압축)

## section1 (Hero)
- subhead (8~12자): 시즌/상황/타겟 + 후킹 단어 (필수템·한방·OK).
  완구→"필수템", 문구→"신학기/공부템", 슬라임→"촉감놀이", 유아→"안심/엄마가 고른"
- mainHeadline (6~12자): 제품 본질 한국어 압축. 한자/영어 직역 X.
- heroImageIndex: heroImageMode 가 "first" 면 0 강제. "llm-pick" 이면
  라이프/사용씬 우선 (없으면 화이트백 OK), 옵션 비교 컷 제외, 적합 X 면 null.
- 좋은 예: subhead="여름 물놀이 필수템" / mainHeadline="더블샷슈퍼워터건"

## section2 (Reviews)
- reviews 정확히 4 장. 서로 다른 USP 4 개. 가짜처럼 안 보이게 어휘/리듬 다르게.
- 각: usp (2~20자) + headline (5~10자, 느낌표 OK) + body (10~15자, 이유/근거).
- 톤: 1인칭 자연스럽게. "최고/혁명" 같은 광고 단어 금지.
- 좋은 예: { usp:"사거리", headline:"멀리까지 쭉!", body:"압축펌프라 시원해요" }

## section3 (Usage 200%)
- label: "[키워드] 200%" (완구→"활용도", 슬라임→"촉감놀이",
  문구→"필기감", 유아→"안심도", 잡화→"편의성")
- headline (8~14자, 느낌표 1회 OK), subhead (10~16자)
- scenarios 2~3 개. 각: caption (12~20자) + imageIndex (사용씬 우선, 화이트백 X)

## section4 (Pain Points)
- intro 3 줄: line1 (8~12자, "~라" 어미), line2 (8~12자), line3 (4~6자, 빨간 강조).
  line3 카테고리 매핑: 완구→"참사/노답", 슬라임→"낭패", 문구→"고생길/허탕", 유아→"걱정"
- cards 2~3 장. 각: title (14~18자, "..." 종결) + subtitle (6~10자, 굵은 검은).
- 페인 = USP 의 반대 + 카테고리 일반 페인. "불편해요" 같은 일반 페인 금지.
- moodImageIndex: 분위기 깔리는 컷 (라이프/사용씬, 화이트백 X). 없으면 null.

## section5 (Solution)
- headlineLine1 (4~8자, 핵심 솔루션) + headlineLine2 (5~10자, 결과/효과)
- subcopy 정확히 3 줄 (각 8~14자). section6 USP 3 개의 미리보기. 어법 통일.
- imageIndex: 매력적인 컷 (제품/사용씬 무관, 옵션 비교 X), 없으면 null.

## section6 (Features)
- label: "[카테고리 단어] 특징" (4~6자)
- headline (8~14자, 느낌표 1회 OK) + bigHeadline (6~10자, 느낌표 강추)
- cards 정확히 3 장. 순서·의미가 section5.subcopy 와 1:1 매칭.
  각: num "01"|"02"|"03" + title (5~8자, USP 명사형) + subtitle (4~7자) + imageIndex.

## section7 (KeyPoint 1) — section6.cards[0] 깊이 풀이
- tagText: "KeyPoint" 영문 고정.
- headlineLine1 (5~10자) + headlineLine2 (5~10자) + emphasisInLine2 (line2 의 부분 문자열, 1~5자).
- body1 (10~16자, USP 작동) + body2 (10~16자, 경쟁 대비) + bodyEmphasis (8~14자, 결론).
- imageIndex: 라이프 우선, 화이트백 OK. section6.cards[0].imageIndex 와 다른 컷 권장.

## section8 (Blue Section) — section6.cards[1,2] 풀이
- introLine1 (8~14자, USP 통합 카피)
- introLine2: section1.subhead 그대로 재사용
- introLine3: section1.mainHeadline 그대로 재사용
- blocks 정확히 2 개:
  - blocks[0] → section6.cards[1] / blocks[1] → section6.cards[2]
  - pillLabel: "01. {USP 명사형}" / "02. {USP 명사형}"
  - headline (5~14자, 1~2줄, \\n 줄바꿈), body (16~32자, 1~2줄, \\n 줄바꿈)
  - imageIndex: 다른 섹션과 중복 X (특히 section7).

## section9 (KeyPoint 2) — 보조 셀링포인트 1 개 (텍스트 only)
- tagText: "KeyPoint" 영문 고정.
- smallHeadline (8~14자, 사용 상황/배경 톤, 느낌표 1회 OK)
- **bigHeadline 정확히 3 줄**: line1 → line2 → line3 가 **한 문장의 자연스러운 분할**이어야 한다.
  - 형태: 형용/부사 → 동사/형용 → 핵심 명사 (= 강조 단어)
  - line1 (2~6자) + line2 (2~6자) + line3 (1~5자, 컬러 강조).
  - 좋은 예:
    · "튼튼하게 / 잡히는 / 그립"   (드론 X, 물총용)
    · "오랜 비행도 / 끄떡없는 / 안정성"  (드론 호버링)
    · "초보자도 / 한 번에 / 척척"    (조작감)
    · "추락에도 / 멀쩡한 / 내구성"  (튼튼함)
  - 안 좋은 예 (의미 단절):
    · "안정감 / 최고! / 비행"   (단어 나열, 흐름 없음)
    · "쉽다 / 좋다 / 굿"         (감탄사 나열)
- emphasisInLine3: line3 의 강조 부분 (대개 line3 전체).
- body 정확히 2 줄, 각 12~18자, 어법 통일 ("~고/서" 라임).
  한자/영어 직역 잔재 ("정고 현정", "코치 픽스" 등) 절대 금지. 100% 자연스러운 한국어.
- topic: 사용한 보조 셀링포인트 명사형 (그립감/내구성/안전마감/휴대성/디자인 등).
  메인 USP 3 개와 겹치면 안 됨.

## section10 (Lifestyles)
- cards 정확히 3 장. section9.topic / 메인 USP 와 모두 다른 보조 속성 3 개.
- 각: smallHeadline (5~10자) + bigHeadlineLine1 (4~7자) + bigHeadlineLine2 (2~5자, 강조) + imageIndex.
- imageIndex 는 라이프/사용씬 우선. 다른 섹션과 중복 X.

## section11 (Gallery / Conclusion)
- galleryImageIndices: 라이프/사용씬 매력적인 컷 2 장 (앞·뒤 [a, b]).
  다른 섹션과 중복 X. 부족하면 null 슬롯.
- symbolCard.icon: lucide 아이콘 (다음 중 하나).
  물총→"Waves", 슬라임→"Sparkles", 문구→"Pencil", 완구일반→"ToyBrick",
  인형→"Heart", 차량→"Car", 도서→"Book", 운동→"Activity", 매핑X→"Sparkles"
- symbolCard.text: 영문 대문자 (3~12자). "WATER GUN", "SLIME", "STATIONERY", "TOY", "DOLL", "CAR", "BOOK", "SPORTS"
- closing.body (각 10~16자, 자랑/요약 톤) 2 줄
- closing.headline (각 4~10자, 큰 마무리, 느낌표 1회 OK) 2 줄

# 출력 JSON 의 최상위 형태
{
  "section1": { subhead, mainHeadline, heroImageIndex },
  "section2": { reviews: [{ usp, headline, body } x4] },
  "section3": { label, headline, subhead, scenarios: [{ caption, imageIndex } x2~3] },
  "section4": { intro: { line1, line2, line3 }, cards: [{ title, subtitle } x2~3], moodImageIndex },
  "section5": { headlineLine1, headlineLine2, subcopy: [s1, s2, s3], imageIndex },
  "section6": { label, headline, bigHeadline, cards: [{ num, title, subtitle, imageIndex } x3] },
  "section7": { tagText: "KeyPoint", headlineLine1, headlineLine2, emphasisInLine2, body1, body2, bodyEmphasis, imageIndex },
  "section8": { introLine1, introLine2, introLine3, blocks: [{ pillLabel, headline, body, imageIndex } x2] },
  "section9": { tagText: "KeyPoint", smallHeadline, bigHeadline: { line1, line2, line3 }, emphasisInLine3, body: [b1, b2], topic },
  "section10": { cards: [{ smallHeadline, bigHeadlineLine1, bigHeadlineLine2, imageIndex } x3] },
  "section11": { galleryImageIndices: [a, b], symbolCard: { icon, text }, closing: { body: [b1, b2], headline: [h1, h2] } }
}`;

export function buildSingleCallUser(input: SingleCallInput): string {
  const { raw, heroImageMode } = input;
  return `다음 raw 제품 데이터로 11 개 섹션을 통째로 생성하라.

heroImageMode: ${heroImageMode}
제품명(원문): ${raw.rawTitle}
카테고리(원문): ${raw.rawCategory}
원본 설명: ${raw.rawDescription}
주요 옵션/스펙: ${raw.rawOptions}

이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}

JSON 객체 1 개만 출력하라. 다른 텍스트 금지.`;
}
