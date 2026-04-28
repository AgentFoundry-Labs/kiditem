import { ServiceUnavailableException } from '@nestjs/common';

export function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ServiceUnavailableException('thumbnail_ai_not_configured');
  return apiKey;
}

export function requireGeminiImageModel(): string {
  const model = process.env.AI_IMAGE_MODEL;
  if (!model) throw new ServiceUnavailableException('thumbnail_ai_image_model_not_configured');
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
