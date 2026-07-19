export const GENERATED_IMAGE_VALIDATOR_PORT = Symbol(
  'GENERATED_IMAGE_VALIDATOR_PORT',
);

export type GeneratedImageValidationCode =
  | 'generated_image_too_large'
  | 'generated_image_dimensions_invalid'
  | 'generated_image_format_invalid';

export class GeneratedImageValidationError extends Error {
  constructor(readonly code: GeneratedImageValidationCode) {
    super(code);
    this.name = 'GeneratedImageValidationError';
  }
}

export interface ValidatedGeneratedImage {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
  fileSize: number;
}

export interface GeneratedImageValidatorPort {
  validate(input: {
    buffer: Buffer;
    declaredMimeType?: string | null;
  }): Promise<ValidatedGeneratedImage>;
}
