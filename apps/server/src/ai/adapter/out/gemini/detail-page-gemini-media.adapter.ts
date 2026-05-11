import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  requireGeminiApiKey,
  requireGeminiImageModel,
  requireGeminiVisionModel,
} from './thumbnail-gemini-config';
import type {
  CompleteDetailPageVisionJsonInput,
  DetailPageMediaImage,
  DetailPageMediaPort,
  GenerateDetailPageImageInput,
  GeneratedDetailPageImage,
} from '../../../application/port/out/detail-page-media.port';

@Injectable()
export class DetailPageGeminiMediaAdapter implements DetailPageMediaPort {
  private readonly logger = new Logger(DetailPageGeminiMediaAdapter.name);
  private client: GoogleGenAI | null = null;

  async generateImage(input: GenerateDetailPageImageInput): Promise<GeneratedDetailPageImage> {
    const response = await this.getClient().models.generateContent({
      model: requireGeminiImageModel(),
      contents: [
        {
          role: 'user',
          parts: this.parts(input.images, input.prompt),
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: input.aspectRatio, imageSize: input.imageSize },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!imagePart?.data) {
      const text = parts.find((part) => part.text)?.text?.slice(0, 300);
      this.logger.warn(`${input.logContext} response had no image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException(input.noImageErrorCode);
    }

    return {
      buffer: Buffer.from(imagePart.data, 'base64'),
      mimeType: imagePart.mimeType ?? 'image/png',
    };
  }

  async completeVisionJson(input: CompleteDetailPageVisionJsonInput): Promise<string | null> {
    const response = await this.getClient().models.generateContent({
      model: requireGeminiVisionModel(),
      contents: [
        {
          role: 'user',
          parts: this.parts(input.images, input.prompt),
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    return text || null;
  }

  private parts(images: DetailPageMediaImage[], prompt: string) {
    return [
      ...images.flatMap((img) => [
        { text: `[${img.label}]` },
        { inlineData: { data: img.data, mimeType: img.mimeType } },
      ]),
      { text: prompt },
    ];
  }

  private getClient(): GoogleGenAI {
    const apiKey = requireGeminiApiKey();
    if (!this.client) this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }
}
