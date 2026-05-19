import { Injectable } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  type ThumbnailImageGenerationCommand,
  type ThumbnailImageGenerationPort,
} from '../../../application/port/out/provider/thumbnail-image-generation.port';
import type { ThumbnailPromptPart } from '../../../application/port/out/provider/thumbnail-reference-images.port';
import {
  requireGeminiApiKey,
  requireGeminiImageModel,
} from './thumbnail-gemini-config';

@Injectable()
export class ThumbnailImageGenerationAdapter implements ThumbnailImageGenerationPort {
  private client: GoogleGenAI | null = null;

  async generateImageParts(
    command: ThumbnailImageGenerationCommand,
  ): Promise<ThumbnailPromptPart[]> {
    const response = await this.raceWithAbort(
      this.getClient().models.generateContent({
        model: this.resolveModel(command.model),
        contents: [
          {
            role: 'user',
            parts: command.parts,
          },
        ],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
          imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
        },
      }),
      command.signal,
    );
    return (response.candidates?.[0]?.content?.parts ?? []) as ThumbnailPromptPart[];
  }

  private resolveModel(model: string | undefined): string {
    const selected = model?.trim();
    if (selected) return selected;
    return requireGeminiImageModel();
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
    }
    return this.client;
  }

  private raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(new Error('ABORTED'));
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true });
      }),
    ]);
  }
}
