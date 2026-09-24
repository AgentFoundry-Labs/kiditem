import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requireGeminiImageModel,
  requireGeminiVerifyModel,
  requireGeminiVisionModel,
} from '../thumbnail-gemini-config';

describe('Gemini media model configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects the retired Gemini 3.1 preview image model and points to the stable model', () => {
    vi.stubEnv('AI_IMAGE_MODEL', 'gemini-3.1-flash-image-preview');

    expect(() => requireGeminiImageModel()).toThrow(expect.objectContaining({
      code: 'CONTENT_MODEL_NOT_CONFIGURED',
      details: { reason: 'IMAGE_MODEL_DEPRECATED', model: 'gemini-3.1-flash-image-preview', replacement: 'gemini-3.1-flash-image' },
    }));
  });

  it('accepts the stable Gemini 3.1 image model', () => {
    vi.stubEnv('AI_IMAGE_MODEL', 'gemini-3.1-flash-image');

    expect(requireGeminiImageModel()).toBe('gemini-3.1-flash-image');
  });

  it('rejects the retired Gemini 3.1 Flash Lite preview analysis model', () => {
    vi.stubEnv('AI_IMAGE_ANALYSIS_MODEL', 'gemini-3.1-flash-lite-preview');

    expect(() => requireGeminiVisionModel()).toThrow(expect.objectContaining({
      code: 'CONTENT_MODEL_NOT_CONFIGURED',
      details: { reason: 'VISION_MODEL_DEPRECATED', model: 'gemini-3.1-flash-lite-preview', replacement: 'gemini-3.1-flash-lite' },
    }));
  });

  it('accepts the stable Gemini 3.1 Flash Lite analysis and verification model', () => {
    vi.stubEnv('AI_IMAGE_ANALYSIS_MODEL', 'gemini-3.1-flash-lite');
    vi.stubEnv('AI_IMAGE_ANALYSIS_VERIFY_MODEL', 'gemini-3.1-flash-lite');

    expect(requireGeminiVisionModel()).toBe('gemini-3.1-flash-lite');
    expect(requireGeminiVerifyModel()).toBe('gemini-3.1-flash-lite');
  });

  it('rejects the retired Gemini 3.1 Flash Lite preview verification model', () => {
    vi.stubEnv('AI_IMAGE_ANALYSIS_VERIFY_MODEL', 'models/gemini-3.1-flash-lite-preview');

    expect(() => requireGeminiVerifyModel()).toThrow(expect.objectContaining({
      code: 'CONTENT_MODEL_NOT_CONFIGURED',
      details: { reason: 'VERIFY_MODEL_DEPRECATED', model: 'models/gemini-3.1-flash-lite-preview', replacement: 'gemini-3.1-flash-lite' },
    }));
  });
});
