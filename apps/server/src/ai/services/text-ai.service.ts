import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class TextAiService {
  async transform(dto: {
    text: string;
    preset: string;
    custom_prompt?: string;
  }): Promise<{ result: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpException(
        'GEMINI_API_KEY가 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const model = process.env.AI_TEXT_MODEL ?? 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemPrompt = this.buildSystemPrompt(dto.preset, dto.custom_prompt);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: dto.text }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.7 },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(
        `Gemini API 오류: ${res.status} ${body.slice(0, 200)}`,
        res.status,
      );
    }

    const data = await res.json();
    const result =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { result: result.trim() };
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
