import { Injectable } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  type ThumbnailImageGenerationCommand,
  type ThumbnailImageGenerationPort,
} from '../../../application/port/out/provider/thumbnail-image-generation.port';
import type { ThumbnailPromptPart } from '../../../application/port/out/provider/thumbnail-reference-images.port';
import {
  requireGeminiApiKey,
} from './thumbnail-gemini-config';

const PROVIDER_TIMEOUT_MS = 120_000;

@Injectable()
export class ThumbnailImageGenerationAdapter implements ThumbnailImageGenerationPort {
  private client: GoogleGenAI | null = null;

  async generateImageParts(
    command: ThumbnailImageGenerationCommand,
  ): Promise<ThumbnailPromptPart[]> {
    command.signal?.throwIfAborted();
    const response = await this.getClient().models.generateContent({
        model: command.model,
        contents: [
          {
            role: 'user',
            parts: command.parts,
          },
        ],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
          imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
          abortSignal: command.signal,
          httpOptions: { timeout: PROVIDER_TIMEOUT_MS },
        },
      });
    return (response.candidates?.[0]?.content?.parts ?? []) as ThumbnailPromptPart[];
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
    }
    return this.client;
  }
}
