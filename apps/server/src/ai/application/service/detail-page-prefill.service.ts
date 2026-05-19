import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { z } from 'zod';
import type { PrefillDetailPageInput } from './detail-page-requests';
import {
  TEXT_COMPLETION_PORT,
  type TextCompletionPort,
} from '../port/out/text-completion.port';
import type { DetailPagePrefillDto } from './detail-page-ai.types';

const TextOrTextArraySchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ');
    }
    return value;
  },
  z.string().min(1).max(80),
);

const DetailPagePrefillSchema = z.object({
  category: z.string().min(1).max(80),
  target: TextOrTextArraySchema,
  features: z.array(z.string().min(2).max(160)).min(3).max(6),
  options: z.array(z.string().min(1).max(60)).min(0).max(10).default([]),
  extraNotes: z.string().max(400).optional().default(''),
});

const DETAIL_PAGE_PREFILL_SYSTEM = `너는 한국 키즈/생활 상품 상세페이지 기획자다.
상품명만 보고 상세페이지 생성 폼에 바로 넣을 수 있는 초안을 만든다.

# 출력
JSON 객체 1개만 출력한다. 코드펜스나 설명 문장은 금지.

# 필드
- category: 쇼핑몰 카테고리 경로. 예: "생활용품/리빙", "완구/놀이", "문구/학용품"
- target: 핵심 구매 타겟. 예: "부모 구매자", "초등학생", "선물 구매자"
- features: 상세페이지 특징 3~5개. 각 문장은 상품명에서 합리적으로 추론 가능한 장점만 쓴다.
- options: 색상/종류/구성 옵션 후보 0~10개. 상품명에서 명확하지 않으면 과하게 만들지 않는다.
- extraNotes: 안전/사용연령/구성품처럼 생성 시 참고할 짧은 메모. 없으면 빈 문자열.
- imageUrls 가 있으면 파일명/경로 힌트를 참고하되, 확인 불가능한 인증/효능은 만들지 않는다.

# 작성 톤
- 한국어로 자연스럽게 쓴다.
- 과장된 인증/효능/의학 표현은 금지한다.
- 키즈 상품이면 보호자 구매 관점과 아이 사용 장면을 함께 고려한다.`;

@Injectable()
export class DetailPagePrefillService {
  constructor(
    @Inject(TEXT_COMPLETION_PORT)
    private readonly textCompletion: TextCompletionPort,
  ) {}

  async prefill(
    dto: PrefillDetailPageInput,
    organizationId: string,
  ): Promise<DetailPagePrefillDto> {
    if (!organizationId) {
      throw new BadRequestException('organization context is required');
    }
    const model = process.env.AI_TEXT_MODEL;
    if (!model) {
      throw new HttpException(
        'AI_TEXT_MODEL이 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const imageCount = dto.imageUrls?.length ?? 0;
    const { text } = await this.textCompletion.complete({
      system: DETAIL_PAGE_PREFILL_SYSTEM,
      user: JSON.stringify({
        productName: dto.rawTitle,
        imageCount,
        imageUrls: dto.imageUrls ?? [],
      }),
      temperature: 0.45,
      responseMimeType: 'application/json',
      model,
    });
    const parsed = DetailPagePrefillSchema.parse(this.extractJson(text));
    const features = parsed.features.map((item) => item.trim()).filter(Boolean).slice(0, 5);
    const options = parsed.options.map((item) => item.trim()).filter(Boolean).slice(0, 10);
    return {
      category: parsed.category.trim(),
      target: parsed.target.trim(),
      features,
      options,
      description: features.map((feature, index) => `${index + 1}. ${feature}`).join('\n'),
      extraNotes: parsed.extraNotes.trim(),
      estimatedSeconds: imageCount >= 5 ? 45 : 30,
    };
  }

  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body);
  }
}
