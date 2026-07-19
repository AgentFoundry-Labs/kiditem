import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type {
  TextCompletionPort,
  TextCompletionRequest,
  TextCompletionResult,
} from '../../../application/port/out/provider/text-completion.port';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

const PROVIDER_TIMEOUT_MS = 120_000;

/**
 * `TEXT_COMPLETION_PORT` 의 concrete adapter — Gemini Generative Language API
 * (`generativelanguage.googleapis.com/v1beta`) 호출을 캡슐화.
 *
 * application service 가 직접 `fetch()` / API key / URL 을 알 필요가 없게 한다.
 * Vision / image generation / JSON-fence 디코딩은 별도 port 책임이다.
 */
@Injectable()
export class GeminiTextCompletionAdapter implements TextCompletionPort {
  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    request.signal?.throwIfAborted();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpException(
        'GEMINI_API_KEY가 설정되지 않았습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`;

    const generationConfig: Record<string, unknown> = {
      temperature: request.temperature,
    };
    if (request.responseMimeType) {
      generationConfig.responseMimeType = request.responseMimeType;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.user }] }],
        systemInstruction: { parts: [{ text: request.system }] },
        generationConfig,
      }),
      signal: request.signal
        ? AbortSignal.any([request.signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)])
        : AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(
        `Gemini API 오류: ${res.status} ${body.slice(0, 500)}`,
        res.status,
      );
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new HttpException(
        `Gemini 응답이 비어있습니다: ${JSON.stringify(data).slice(0, 500)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { text: text.trim() };
  }
}
