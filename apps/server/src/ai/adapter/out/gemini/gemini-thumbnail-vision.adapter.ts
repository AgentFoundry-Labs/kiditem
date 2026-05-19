import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  requireGeminiApiKey,
  requireGeminiVerifyModel,
  requireGeminiVisionModel,
} from './thumbnail-gemini-config';
import type { ImageBytes } from '../../../domain/thumbnail-image-spec';
import {
  IMAGE_FETCH_PORT,
  type FetchedImage,
  type ImageFetchPort,
} from '../../../application/port/out/provider/image-fetch.port';
import type {
  ThumbnailVisionContents,
  ThumbnailVisionProviderPort,
} from '../../../application/port/out/provider/thumbnail-vision-provider.port';

/**
 * Owns the Gemini client lifecycle and the request/response envelope shared by
 * the thumbnail vision pipeline: lazy `GoogleGenAI` init, vision/verify model
 * `generateContent` calls, JSON envelope extraction, and `AbortSignal`
 * cooperation. Image fetches go through `ThumbnailImageFetcherService` so
 * SSRF / redirect / MIME / size checks remain centralized.
 *
 * No compliance / quality / image-spec semantics live here — those are pure
 * helpers in `domain/`. The adapter only knows "I called Gemini and the
 * response either contained a JSON envelope or it didn't".
 */
@Injectable()
export class GeminiThumbnailVisionAdapter implements ThumbnailVisionProviderPort {
  private readonly logger = new Logger(GeminiThumbnailVisionAdapter.name);
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
  ) {}

  // ─── Image fetch ─────────────────────────────────────────────────────────

  async fetchImageBytes(imageUrl: string): Promise<ImageBytes> {
    const fetched = await this.imageFetcher.fetchTrustedStorageImage(imageUrl);
    return {
      data: fetched.buffer.toString('base64'),
      mimeType: fetched.mimeType,
    };
  }

  fetchTrustedStorageImage(imageUrl: string): Promise<FetchedImage> {
    return this.imageFetcher.fetchTrustedStorageImage(imageUrl);
  }

  // ─── Configuration ──────────────────────────────────────────────────────

  /**
   * Eagerly validate that the Gemini client can be constructed (i.e.
   * `GEMINI_API_KEY` is set). Lets callers fail fast with the explicit
   * `ServiceUnavailableException` from `requireGeminiApiKey` before doing
   * other potentially slow work like trusted-storage image fetches.
   */
  assertConfigured(): void {
    this.getClient();
  }

  // ─── Gemini calls ────────────────────────────────────────────────────────

  /**
   * Vision-model call expecting a top-level JSON array response. Throws
   * `ServiceUnavailableException(errorCode)` when the response text is
   * empty or contains no `[ ... ]` envelope.
   */
  async callVisionForJsonArray<T>(
    contents: ThumbnailVisionContents,
    errorCode: string,
    signal?: AbortSignal,
  ): Promise<T[]> {
    const text = await this.callVisionRaw(contents, signal);
    return this.extractJsonArray<T>(text, errorCode);
  }

  /**
   * Verify-model call expecting a top-level JSON object response. Used by
   * the 2-pass physical-vs-digital, white-background, and bundle-composition
   * verifications.
   */
  async callVerifyForJsonObject<T>(
    contents: ThumbnailVisionContents,
    errorCode: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const text = await this.callVerifyRaw(contents, signal);
    return this.extractJsonObject<T>(text, errorCode);
  }

  /**
   * JSON-only classifier wrapped in the vision model. Returns the raw text
   * payload (caller parses) so different classify shapes don't all funnel
   * through one rigid type.
   */
  async callVisionForJsonText(
    contents: ThumbnailVisionContents,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const client = this.getClient();
    const response = await this.raceWithAbort(
      client.models.generateContent({
        model: requireGeminiVisionModel(),
        contents: contents.contents,
        config: {
          responseModalities: ['TEXT'],
          responseMimeType: 'application/json',
        },
      }),
      signal,
    );
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    return parts.find((p) => p.text)?.text?.trim() ?? null;
  }

  // ─── Abort cooperation ──────────────────────────────────────────────────

  raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(this.abortError());
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(this.abortError()), { once: true });
      }),
    ]);
  }

  throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw this.abortError();
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = requireGeminiApiKey();
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  private async callVisionRaw(
    contents: ThumbnailVisionContents,
    signal?: AbortSignal,
  ): Promise<string> {
    const client = this.getClient();
    const response = await this.raceWithAbort(
      client.models.generateContent({
        model: requireGeminiVisionModel(),
        contents: contents.contents,
      }),
      signal,
    );
    return response.text ?? '';
  }

  private async callVerifyRaw(
    contents: ThumbnailVisionContents,
    signal?: AbortSignal,
  ): Promise<string> {
    const client = this.getClient();
    const response = await this.raceWithAbort(
      client.models.generateContent({
        model: requireGeminiVerifyModel(),
        contents: contents.contents,
      }),
      signal,
    );
    return response.text ?? '';
  }

  private extractJsonArray<T>(text: string, errorCode: string): T[] {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new ServiceUnavailableException(errorCode);
    }
    return JSON.parse(jsonMatch[0]) as T[];
  }

  private extractJsonObject<T>(text: string, errorCode: string): T {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new ServiceUnavailableException(errorCode);
    }
    return JSON.parse(jsonMatch[0]) as T;
  }

  private abortError(): Error {
    return new Error('ABORTED');
  }
}
