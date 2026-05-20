import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

const DATA_IMAGE_URL_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function IsHttpOrDataImageUrl(validationOptions?: ValidationOptions) {
  return ValidateBy({
    name: 'isHttpOrDataImageUrl',
    validator: {
      validate(value: unknown) {
        if (typeof value !== 'string') return false;
        if (DATA_IMAGE_URL_RE.test(value)) return true;

        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      defaultMessage() {
        return 'image_url must be an http(s) URL or a base64 data:image URL';
      },
    },
  }, validationOptions);
}

export class ImageEditBodyDto {
  @IsString() @IsHttpOrDataImageUrl() @IsOptional() image_url?: string;
  @IsArray()
  @IsString({ each: true })
  @IsHttpOrDataImageUrl({ each: true })
  @IsOptional()
  image_urls?: string[];
  @IsString() preset: string;
  @IsString() @IsOptional() user_prompt?: string;
  @IsUUID() @IsOptional() productId?: string;
  @IsUUID() @IsOptional() contentGenerationId?: string;
}
