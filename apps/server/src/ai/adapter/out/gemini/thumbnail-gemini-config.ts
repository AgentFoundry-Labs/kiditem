import { ServiceUnavailableException } from '@nestjs/common';

const DEPRECATED_IMAGE_MODELS = new Map<string, string>([
  ['gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image-preview'],
  ['models/gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image-preview'],
]);

export function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ServiceUnavailableException('thumbnail_ai_not_configured');
  return apiKey;
}

export function requireGeminiImageModel(): string {
  const model = process.env.AI_IMAGE_MODEL?.trim();
  if (!model) throw new ServiceUnavailableException('thumbnail_ai_image_model_not_configured');
  const replacement = DEPRECATED_IMAGE_MODELS.get(model);
  if (replacement) {
    throw new ServiceUnavailableException(
      `AI_IMAGE_MODEL ${model} is deprecated or unavailable. Set AI_IMAGE_MODEL=${replacement}.`,
    );
  }
  return model;
}

export function requireGeminiVisionModel(): string {
  const model = process.env.AI_IMAGE_ANALYSIS_MODEL;
  if (!model) throw new ServiceUnavailableException('thumbnail_ai_vision_model_not_configured');
  return model;
}

export function requireGeminiVerifyModel(): string {
  const model = process.env.AI_IMAGE_ANALYSIS_VERIFY_MODEL;
  if (!model) throw new ServiceUnavailableException('thumbnail_ai_verify_model_not_configured');
  return model;
}
