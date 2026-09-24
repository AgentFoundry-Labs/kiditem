import { KiditemExternalError } from '@kiditem/shared/errors';

const DEPRECATED_IMAGE_MODELS = new Map<string, string>([
  ['gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image'],
  ['models/gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image'],
  ['gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image'],
  ['models/gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image'],
]);

const DEPRECATED_ANALYSIS_MODELS = new Map<string, string>([
  ['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite'],
  ['models/gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite'],
]);

export function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', { details: { reason: 'GEMINI_API_KEY_MISSING' } });
  return apiKey;
}

export function requireGeminiImageModel(): string {
  const model = process.env.AI_IMAGE_MODEL?.trim();
  if (!model) throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', { details: { reason: 'IMAGE_MODEL_MISSING' } });
  const replacement = DEPRECATED_IMAGE_MODELS.get(model);
  if (replacement) {
    throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', {
      details: { reason: 'IMAGE_MODEL_DEPRECATED', model, replacement },
    });
  }
  return model;
}

export function requireGeminiVisionModel(): string {
  const model = process.env.AI_IMAGE_ANALYSIS_MODEL?.trim();
  if (!model) throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', { details: { reason: 'VISION_MODEL_MISSING' } });
  const replacement = DEPRECATED_ANALYSIS_MODELS.get(model);
  if (replacement) {
    throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', {
      details: { reason: 'VISION_MODEL_DEPRECATED', model, replacement },
    });
  }
  return model;
}

export function requireGeminiVerifyModel(): string {
  const model = process.env.AI_IMAGE_ANALYSIS_VERIFY_MODEL?.trim();
  if (!model) throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', { details: { reason: 'VERIFY_MODEL_MISSING' } });
  const replacement = DEPRECATED_ANALYSIS_MODELS.get(model);
  if (replacement) {
    throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', {
      details: { reason: 'VERIFY_MODEL_DEPRECATED', model, replacement },
    });
  }
  return model;
}
