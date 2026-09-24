import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  TEXT_COMPLETION_PORT,
  type TextCompletionPort,
} from '../port/out/provider/text-completion.port';

@Injectable()
export class TextAiService {
  constructor(
    @Inject(TEXT_COMPLETION_PORT)
    private readonly textCompletion: TextCompletionPort,
  ) {}

  async transform(dto: {
    text: string;
    preset: string;
    custom_prompt?: string;
  }): Promise<{ result: string }> {
    const model = process.env.AI_TEXT_MODEL;
    if (!model) {
      throw new HttpException(
        'AI_TEXT_MODEL이 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const systemPrompt = this.buildSystemPrompt(dto.preset, dto.custom_prompt);
    const { text } = await this.textCompletion.complete({
      system: systemPrompt,
      user: dto.text,
      temperature: 0.7,
      model,
    });
    return { result: text };
  }

  private buildSystemPrompt(
    preset: string,
    customPrompt?: string,
  ): string {
    const prompts: Record<string, string> = {
      rewrite:
        '당신은 이커머스 상세페이지 카피라이터입니다. 입력된 텍스트를 구매 유도와 핵심 강조에 최적화된 자연스러운 한국어로 다시 작성하세요. 원문 의미를 유지하되 더 설득력 있게 표현하세요. 텍스트만 출력하고 다른 내용은 포함하지 마세요.',
      translate:
        '당신은 중국어-한국어 번역가입니다. 입력된 중국어 텍스트를 이커머스 상세페이지에 적합한 자연스러운 한국어로 번역하세요. 번역된 텍스트만 출력하고 다른 내용은 포함하지 마세요.',
      shorten:
        '입력된 텍스트의 핵심 내용만 남기고 약 50% 분량으로 줄이세요. 중요하지 않은 수식어와 반복 표현을 제거하세요. 결과 텍스트만 출력하고 다른 내용은 포함하지 마세요.',
      custom: customPrompt ?? '텍스트를 개선하세요.',
    };
    return prompts[preset] ?? prompts.custom;
  }
}
